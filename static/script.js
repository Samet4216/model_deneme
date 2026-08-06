document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('refresh-btn');
    let mapChartInstance = null;
    let f1ChartInstance = null;

    // Refresh Results manually
    refreshBtn.addEventListener('click', fetchResults);

    let currentDashboardData = [];

    // Fetch and render results
    async function fetchResults() {
        try {
            const res = await fetch('/api/results');
            let data = await res.json();
            
            // Apply saved order if it exists
            const savedOrder = localStorage.getItem('modelOrder');
            if (savedOrder) {
                const orderArr = JSON.parse(savedOrder);
                data.sort((a, b) => {
                    const idxA = orderArr.indexOf(a.folder);
                    const idxB = orderArr.indexOf(b.folder);
                    if (idxA === -1 && idxB === -1) return 0;
                    if (idxA === -1) return 1; // Unsaved models go to the end
                    if (idxB === -1) return -1;
                    return idxA - idxB;
                });
            }
            
            currentDashboardData = data;
            renderDashboard(currentDashboardData);
        } catch (e) {
            console.error("Failed to fetch results", e);
        }
    }

    function renderDashboard(data) {
        const grid = document.getElementById('results-grid');
        grid.innerHTML = '';
        
        const labels = [];
        const map50Data = [];
        const f1Data = [];
        const colors = ['#7c3aed', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
        
        // 1. Render Metrics Cards
        data.forEach((item, index) => {
            const splitData = item.metrics.valid || item.metrics.test || {};
            const precision = splitData.Precision || 0;
            const recall = splitData.Recall || 0;
            const map50 = splitData.mAP50 || 0;
            const map5095 = splitData.mAP5095 || 0;
            const f1 = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;

            // attach parsed metrics back to item for reporting
            item.parsedMetrics = { precision, recall, map50, map5095, f1 };

            const shortName = item.model_name.length > 25 ? item.model_name.substring(0,25) + '...' : item.model_name;
            labels.push(shortName);
            map50Data.push(map50);
            f1Data.push(f1);

            const card = document.createElement('div');
            card.className = 'result-card glass-card';
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <h3 class="editable-model-name" data-folder="${item.folder}" title="Yeniden adlandırmak için tıklayın" style="cursor: pointer; margin: 0;">
                        ${item.model_name} ✏️
                    </h3>
                    <div style="display: flex; gap: 0.3rem;">
                        <button class="order-btn order-left" data-idx="${index}" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; font-size:1.2rem; padding:0 0.2rem;" title="Sola Taşı" ${index === 0 ? 'disabled style="opacity:0.2"' : ''}>◀</button>
                        <button class="order-btn order-right" data-idx="${index}" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer; font-size:1.2rem; padding:0 0.2rem;" title="Sağa Taşı" ${index === data.length - 1 ? 'disabled style="opacity:0.2"' : ''}>▶</button>
                    </div>
                </div>
                <p class="subtitle" style="margin-top: 0.5rem;">Analiz: <strong>${item.folder}</strong></p>
                <table class="metrics-table">
                    <tr><th>Precision</th><td>${precision.toFixed(4)}</td></tr>
                    <tr><th>Recall</th><td>${recall.toFixed(4)}</td></tr>
                    <tr><th>F1 Score</th><td>${f1.toFixed(4)}</td></tr>
                    <tr><th>mAP@0.5</th><td>${map50.toFixed(4)}</td></tr>
                    <tr><th>mAP@0.5:0.95</th><td>${map5095.toFixed(4)}</td></tr>
                </table>
            `;
            grid.appendChild(card);
        });

        // Add event listeners for editing model names
        setTimeout(() => {
            document.querySelectorAll('.editable-model-name').forEach(el => {
                el.addEventListener('click', async (e) => {
                    const folder = e.currentTarget.getAttribute('data-folder');
                    const currentName = e.currentTarget.innerText.replace('✏️', '').trim();
                    const newName = prompt('Bu analiz için yeni bir isim girin:', currentName);
                    
                    if (newName && newName !== currentName) {
                        try {
                            const res = await fetch('/api/rename', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ folder: folder, new_name: newName })
                            });
                            if (res.ok) {
                                fetchResults(); // Reload everything to apply the new name globally
                            } else {
                                alert('İsim değiştirilirken bir hata oluştu.');
                            }
                        } catch (err) {
                            console.error(err);
                        }
                    }
                });
            });
        }, 100);

        // 2. Render Side-by-Side Image Comparisons
        let allImages = new Set();
        data.forEach(item => item.images.forEach(img => allImages.add(img)));
        
        const priorityImages = ['val_curves.png', 'size_heatmap_valid.png', 'size_heatmap_test.png'];
        const sortedImages = Array.from(allImages).sort((a, b) => {
            let idxA = priorityImages.indexOf(a);
            let idxB = priorityImages.indexOf(b);
            if(idxA === -1) idxA = 999;
            if(idxB === -1) idxB = 999;
            return idxA - idxB;
        });

        const oldContainer = document.getElementById('image-comparison-container');
        if (oldContainer) oldContainer.remove();

        const imageComparisonContainer = document.createElement('div');
        imageComparisonContainer.id = 'image-comparison-container';
        imageComparisonContainer.style.marginTop = '2rem';
        
        // Calculate max values for heatmap cells to highlight the highest across models
        const maxHeatmapValues = { valid: {}, test: {} };
        const heatmapMetrics = ['Precision', 'Recall', 'F1', 'mAP50'];
        const sizeGroups = ['0-16 px (Çok Küçük)', '16-32 px (Küçük)', '32-64 px (Orta)', '64+ px (Büyük)'];

        data.forEach(item => {
            if (item.metrics_by_size) {
                item.metrics_by_size.forEach(row => {
                    let split = row.Split;
                    let size = row['Boyut Grubu'];
                    if (!maxHeatmapValues[split]) return;
                    if (!maxHeatmapValues[split][size]) maxHeatmapValues[split][size] = {};
                    
                    heatmapMetrics.forEach(m => {
                        if (!maxHeatmapValues[split][size][m]) maxHeatmapValues[split][size][m] = 0;
                        if (row[m] > maxHeatmapValues[split][size][m]) {
                            maxHeatmapValues[split][size][m] = row[m];
                        }
                    });
                });
            }
        });

        sortedImages.forEach(imgName => {
            const section = document.createElement('div');
            section.className = 'glass-card';
            section.style.padding = '1.5rem';
            section.style.marginBottom = '1.5rem';
            
            let displayName = imgName.replace('.png', '').replace(/_/g, ' ').toUpperCase();
            
            let html = `<h3 style="margin-bottom: 1rem; color: var(--accent);">${displayName}</h3>`;
            html += `<div class="images-preview">`;
            
            data.forEach(item => {
                if (item.images.includes(imgName)) {
                    html += `
                    <div class="image-wrapper">
                        <span class="image-title">Analiz: ${item.folder}<br><span style="font-size:0.85em; font-weight:normal; color:#94a3b8;">${item.model_name}</span></span>`;
                    
                    // If it's a size heatmap and we have metrics_by_size, render an interactive HTML table
                    if (imgName.includes('size_heatmap') && item.metrics_by_size) {
                        const split = imgName.includes('test') ? 'test' : 'valid';
                        let tableHtml = `<div style="width: 100%; border-radius: 8px; overflow: hidden; background: #111; font-family: monospace; font-size: 0.85rem; border: 1px solid var(--border-glass); margin-top: 1rem;">`;
                        tableHtml += `<table style="width: 100%; border-collapse: collapse;">`;
                        tableHtml += `<tr><th style="padding: 0.5rem; text-align: right; color: #888;"></th>`;
                        heatmapMetrics.forEach(m => tableHtml += `<th style="padding: 0.5rem; text-align: center; color: #888; border-bottom: 1px solid #333;">${m === 'mAP50' ? 'mAP@0.5' : m}</th>`);
                        tableHtml += `</tr>`;
                        
                        sizeGroups.forEach(size => {
                            const prefix = size.split(' ')[0]; // Extract '0-16', '16-32', etc. to avoid encoding issues with Turkish characters
                            const rowData = item.metrics_by_size.find(r => r.Split === split && r['Boyut Grubu'] && r['Boyut Grubu'].startsWith(prefix));
                            if (rowData) {
                                tableHtml += `<tr>`;
                                tableHtml += `<td style="padding: 0.5rem; text-align: right; color: #aaa; border-right: 1px solid #333;">${size}</td>`;
                                heatmapMetrics.forEach(m => {
                                    const val = rowData[m];
                                    
                                    // We need to also fix how maxHeatmapValues is calculated since size was used there too
                                    // Actually, maxHeatmapValues uses the raw row['Boyut Grubu'] string, which contains the  chars!
                                    const rawSize = rowData['Boyut Grubu'];
                                    const maxVal = maxHeatmapValues[split] && maxHeatmapValues[split][rawSize] ? maxHeatmapValues[split][rawSize][m] : 0;
                                    
                                    const isMax = (val >= maxVal && val > 0);
                                    
                                    // RdYlGn Colormap interpolation
                                    let r, g, b;
                                    if (val < 0.5) {
                                        const t = val / 0.5;
                                        r = Math.round(165 + t * (255 - 165));
                                        g = Math.round(0 + t * (255 - 0));
                                        b = Math.round(38 + t * (191 - 38));
                                    } else {
                                        const t = (val - 0.5) / 0.5;
                                        r = Math.round(255 + t * (0 - 255));
                                        g = Math.round(255 + t * (104 - 255));
                                        b = Math.round(191 + t * (55 - 191));
                                    }
                                    const bgColor = `rgb(${r}, ${g}, ${b})`;
                                    
                                    // Dynamic text color for readability
                                    const baseColor = (val < 0.25 || val > 0.8) ? '#ffffff' : '#111111';
                                    
                                    let borderStyle = isMax ? 'border: 3px solid #3b82f6; box-shadow: inset 0 0 12px rgba(59,130,246,0.9);' : 'border: 1px solid #444;';
                                    let fw = isMax ? 'bold' : 'normal';
                                    let color = isMax ? (val > 0.8 ? '#fff' : '#000') : baseColor; // keep contrast for max highlight
                                    if (isMax) fw = '900'; // Make max values even bolder
                                    
                                    tableHtml += `<td style="padding: 0.5rem; text-align: center; background: ${bgColor}; color: ${color}; font-weight: ${fw}; ${borderStyle}">${val.toFixed(3)}</td>`;
                                });
                                tableHtml += `</tr>`;
                            }
                        });
                        tableHtml += `</table></div>`;
                        html += tableHtml;
                    } else {
                        // Standard image rendering (Lightbox enabled)
                        html += `
                        <img src="/api/image/${item.folder}/${imgName}" title="${item.model_name}" alt="${imgName}" class="clickable-image" data-group="${imgName}" data-model="${item.model_name}">`;
                    }
                    html += `</div>`;
                }
            });
            html += `</div>`;
            section.innerHTML = html;
            imageComparisonContainer.appendChild(section);
        });

        grid.parentElement.appendChild(imageComparisonContainer);

        drawCharts(labels, map50Data, f1Data, colors);
        generateReport(data, grid.parentElement);
    }

    function generateReport(data, container) {
        const oldReport = document.getElementById('report-container');
        if (oldReport) oldReport.remove();

        if (!data || data.length === 0) return;

        // Sorting functions to find best models
        const getBest = (metric) => [...data].sort((a, b) => b.parsedMetrics[metric] - a.parsedMetrics[metric])[0];
        const getWorst = (metric) => [...data].sort((a, b) => a.parsedMetrics[metric] - b.parsedMetrics[metric])[0];
        
        const bestPrecision = getBest('precision');
        const bestRecall = getBest('recall');
        const bestMap50 = getBest('map50');
        const bestMap5095 = getBest('map5095');
        const bestF1 = getBest('f1');
        const worstF1 = getWorst('f1');

        // Best for all object sizes
        let bestSizes = {
            '0-16px': { name: '-', score: 0 },
            '16-32px': { name: '-', score: 0 },
            '32-64px': { name: '-', score: 0 },
            '64+px': { name: '-', score: 0 }
        };
        
        data.forEach(item => {
            if (item.metrics_by_size) {
                const parseSizeRow = (prefix, key) => {
                    const row = item.metrics_by_size.find(r => r['Boyut Grubu'] && r['Boyut Grubu'].startsWith(prefix));
                    if (row && row.mAP50 > bestSizes[key].score) {
                        bestSizes[key] = { name: item.model_name, score: row.mAP50 };
                    }
                };
                parseSizeRow('0-16', '0-16px');
                parseSizeRow('16-32', '16-32px');
                parseSizeRow('32-64', '32-64px');
                parseSizeRow('64+', '64+px');
            }
        });

        // Scoring system: each model gets points based on their rank in each metric
        const metricsList = ['precision', 'recall', 'map50', 'map5095', 'f1'];
        data.forEach(item => item.totalScore = 0);
        
        metricsList.forEach(metric => {
            let sorted = [...data].sort((a, b) => b.parsedMetrics[metric] - a.parsedMetrics[metric]);
            sorted.forEach((item, index) => {
                // 1st gets N points, 2nd gets N-1, etc.
                item.totalScore += (data.length - index);
            });
        });

        // The overall best and worst models
        const sortedByScore = [...data].sort((a, b) => b.totalScore - a.totalScore);
        const overallBest = sortedByScore[0];
        const overallWorst = sortedByScore[sortedByScore.length - 1];
        
        let f1Diff = 0;
        if (data.length > 1 && worstF1.parsedMetrics.f1 > 0) {
            f1Diff = ((overallBest.parsedMetrics.f1 - worstF1.parsedMetrics.f1) / worstF1.parsedMetrics.f1 * 100).toFixed(1);
        }

        // Model characteristic profiling (Aggressive vs Conservative)
        data.forEach(item => {
            const p = item.parsedMetrics.precision;
            const r = item.parsedMetrics.recall;
            if (p > r + 0.1) item.profile = "🛡️ Tutucu (Yüksek Hassasiyet, Az Yanlış Alarm)";
            else if (r > p + 0.1) item.profile = "⚔️ Agresif (Çok Nesne Bulma, Fazla Yanlış Alarm)";
            else item.profile = "⚖️ Dengeli (Optimum Uyum)";
        });

        const reportDiv = document.createElement('div');
        reportDiv.id = 'report-container';
        reportDiv.className = 'report-panel glass-card';
        reportDiv.style.border = '1px solid var(--success)';
        reportDiv.style.background = 'rgba(16, 185, 129, 0.05)';
        
        reportDiv.innerHTML = `
            <h2>📊 Kapsamlı Veri Bilimi ve Model Karakteristik Raporu</h2>
            <p style="margin-bottom: 1.5rem; color: var(--text-muted);">Toplam <strong>${data.length}</strong> analiz üzerinden yapılan derinlemesine istatistiksel değerlendirme.</p>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
                <div class="glass-card" style="padding: 1rem; text-align: center; border: 1px solid rgba(255,255,255,0.1);">
                    <div style="font-size: 0.8rem; color: var(--text-muted);">En İyi Precision (Doğruluk Oranı)</div>
                    <div style="color: var(--accent); font-weight: bold; font-size: 1.1rem; margin: 0.5rem 0;">${bestPrecision.model_name}</div>
                    <div style="font-size: 1.2rem; font-weight: bold;">${bestPrecision.parsedMetrics.precision.toFixed(4)}</div>
                </div>
                <div class="glass-card" style="padding: 1rem; text-align: center; border: 1px solid rgba(255,255,255,0.1);">
                    <div style="font-size: 0.8rem; color: var(--text-muted);">En İyi Recall (Kaçırmama Oranı)</div>
                    <div style="color: var(--accent); font-weight: bold; font-size: 1.1rem; margin: 0.5rem 0;">${bestRecall.model_name}</div>
                    <div style="font-size: 1.2rem; font-weight: bold;">${bestRecall.parsedMetrics.recall.toFixed(4)}</div>
                </div>
                <div class="glass-card" style="padding: 1rem; text-align: center; border: 1px solid rgba(255,255,255,0.1);">
                    <div style="font-size: 0.8rem; color: var(--text-muted);">En İyi mAP@0.5 (Genel Tespit)</div>
                    <div style="color: var(--accent); font-weight: bold; font-size: 1.1rem; margin: 0.5rem 0;">${bestMap50.model_name}</div>
                    <div style="font-size: 1.2rem; font-weight: bold;">${bestMap50.parsedMetrics.map50.toFixed(4)}</div>
                </div>
                <div class="glass-card" style="padding: 1rem; text-align: center; border: 1px solid rgba(255,255,255,0.1);">
                    <div style="font-size: 0.8rem; color: var(--text-muted);">En İyi mAP@0.5:0.95 (Sınır Çizimi)</div>
                    <div style="color: var(--accent); font-weight: bold; font-size: 1.1rem; margin: 0.5rem 0;">${bestMap5095.model_name}</div>
                    <div style="font-size: 1.2rem; font-weight: bold;">${bestMap5095.parsedMetrics.map5095.toFixed(4)}</div>
                </div>
                <div class="glass-card" style="padding: 1rem; text-align: center; border: 1px solid rgba(255,255,255,0.1);">
                    <div style="font-size: 0.8rem; color: var(--text-muted);">En İyi F1 Score (Harmonik Ortalama)</div>
                    <div style="color: var(--accent); font-weight: bold; font-size: 1.1rem; margin: 0.5rem 0;">${bestF1.model_name}</div>
                    <div style="font-size: 1.2rem; font-weight: bold;">${bestF1.parsedMetrics.f1.toFixed(4)}</div>
                </div>
            </div>

            <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid var(--success); padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem;">
                <h3 style="color: var(--success); margin-bottom: 1rem; border-bottom: 1px solid rgba(16,185,129,0.3); padding-bottom: 0.5rem;">
                    🏆 Nihai Şampiyon & Karakter Analizi: ${overallBest.model_name}
                </h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
                    <div>
                        <h4 style="color: var(--accent); margin-bottom: 0.5rem;">Karakteristik Özellikleri</h4>
                        <p style="font-size: 1.05rem; line-height: 1.6; margin-bottom: 1rem; color: var(--text-main);">
                            Ağırlıklı metrik (P, R, mAP) sıralamasında <strong>${overallBest.model_name}</strong> modeli 1. sıraya yerleşerek testlerin en stabil modeli seçilmiştir. Karakteristik olarak <strong>${overallBest.profile}</strong> profili sergilemektedir.
                        </p>
                        <ul style="list-style-type: disc; padding-left: 1.5rem; color: var(--text-main); line-height: 1.8;">
                            <li><strong>Genel Performans:</strong> Ortalama ${overallBest.parsedMetrics.f1.toFixed(4)} F1 skoru ile nesne kaçırmama (Recall) ve doğruyu bulma (Precision) arasında en iyi dengeyi yakalamıştır.</li>
                            ${data.length > 1 ? `<li><strong>Kıyaslamalı Üstünlük:</strong> Zirvede yer alan bu model, listenin en altındaki (<strong>${overallWorst.model_name}</strong>) modele kıyasla başarısını F1 bazında tam <strong>%${f1Diff}</strong> artırmıştır.</li>` : ''}
                        </ul>
                    </div>
                    <div>
                        <h4 style="color: var(--accent); margin-bottom: 0.5rem;">🔍 Bütün Boyut Sınıflarındaki Liderler</h4>
                        <ul style="list-style-type: disc; padding-left: 1.5rem; color: var(--text-main); line-height: 1.8;">
                            <li><strong>Çok Küçük (0-16px):</strong> <strong style="color:var(--success)">${bestSizes['0-16px'].name}</strong> ${bestSizes['0-16px'].score > 0 ? `(mAP: ${bestSizes['0-16px'].score.toFixed(3)})` : ''} — <i>Uzaktaki mikroskobik nesneler için ideal.</i></li>
                            <li><strong>Küçük (16-32px):</strong> <strong style="color:var(--success)">${bestSizes['16-32px'].name}</strong> ${bestSizes['16-32px'].score > 0 ? `(mAP: ${bestSizes['16-32px'].score.toFixed(3)})` : ''}</li>
                            <li><strong>Orta (32-64px):</strong> <strong style="color:var(--success)">${bestSizes['32-64px'].name}</strong> ${bestSizes['32-64px'].score > 0 ? `(mAP: ${bestSizes['32-64px'].score.toFixed(3)})` : ''}</li>
                            <li><strong>Büyük (64px+):</strong> <strong style="color:var(--success)">${bestSizes['64+px'].name}</strong> ${bestSizes['64+px'].score > 0 ? `(mAP: ${bestSizes['64+px'].score.toFixed(3)})` : ''} — <i>Yakın plandaki belirgin nesneler.</i></li>
                        </ul>
                    </div>
                </div>
            </div>
            
            <div style="padding: 1.5rem; background: rgba(255,255,255,0.03); border-radius: 8px; border-left: 4px solid var(--accent);">
                <h4 style="color: var(--accent); margin-top: 0; margin-bottom: 0.5rem;">💡 Senaryo Odaklı Kullanım Önerileri</h4>
                <ul style="list-style-type: disc; padding-left: 1.5rem; color: var(--text-muted); line-height: 1.8; margin-bottom: 0;">
                    <li>Eğer kullanım senaryonuzda <strong>"yanlış alarm olmasın, sadece %100 emin olduğu şeyleri göstersin"</strong> istiyorsanız, en yüksek Precision değerine sahip olan <strong>${bestPrecision.model_name}</strong> modelini seçmelisiniz. (Profil: ${bestPrecision.profile})</li>
                    <li>Eğer uygulamanız <strong>güvenlik/kanser tespiti</strong> gibi "yanlış alarm verebilir ama asla bir nesneyi gözden kaçırmamalı" mantığında ise en yüksek Recall'a sahip <strong>${bestRecall.model_name}</strong> modeli kullanılmalıdır. (Profil: ${bestRecall.profile})</li>
                    <li>Eğer modelin hem yakın çekimde hem de çok uzaktaki drone çekimlerinde çalışması gerekiyorsa (Çok küçük nesneler), sadece genel mAP değerine değil, üstteki listeden "Çok Küçük" nesne lideri olan <strong>${bestSizes['0-16px'].name}</strong> modeline odaklanmalısınız.</li>
                </ul>
            </div>
        `;
        
        container.appendChild(reportDiv);
    }

    function drawCharts(labels, map50, f1, colors) {
        Chart.defaults.color = '#94a3b8';
        Chart.defaults.font.family = 'Inter';

        if (mapChartInstance) mapChartInstance.destroy();
        if (f1ChartInstance) f1ChartInstance.destroy();

        const ctxMap = document.getElementById('mapChart').getContext('2d');
        mapChartInstance = new Chart(ctxMap, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'mAP@0.5',
                    data: map50,
                    backgroundColor: colors[0] + '80', // semi-transparent
                    borderColor: colors[0],
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'mAP@0.5 Comparison', color: '#f8fafc' }
                },
                scales: { y: { beginAtZero: true, max: 1 } }
            }
        });

        const ctxF1 = document.getElementById('f1Chart').getContext('2d');
        f1ChartInstance = new Chart(ctxF1, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'F1 Score',
                    data: f1,
                    backgroundColor: colors[1] + '80',
                    borderColor: colors[1],
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: true, text: 'F1 Score Comparison', color: '#f8fafc' }
                },
                scales: { y: { beginAtZero: true, max: 1 } }
            }
        });
    }

    // Initial load
    fetchResults();

    // Lightbox Logic
    const lightboxModal = document.getElementById('lightbox-modal');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxCaption = document.getElementById('lightbox-caption');
    const lightboxClose = document.querySelector('.lightbox-close');
    const lightboxNext = document.querySelector('.lightbox-next');
    const lightboxPrev = document.querySelector('.lightbox-prev');
    
    let currentImageGroup = [];
    let currentImageIndex = 0;

    // Delegate click events for all clickable images
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('clickable-image')) {
            const groupName = e.target.getAttribute('data-group');
            const allInGroup = Array.from(document.querySelectorAll("img[data-group='" + groupName + "']"));
            currentImageGroup = allInGroup;
            currentImageIndex = allInGroup.indexOf(e.target);
            showLightboxImage();
            lightboxModal.style.display = 'block';
        }
    });

    function showLightboxImage() {
        if (currentImageGroup.length === 0) return;
        const imgEl = currentImageGroup[currentImageIndex];
        lightboxImg.src = imgEl.src;
        lightboxCaption.innerText = "Analiz: " + imgEl.getAttribute('data-model') + " - " + imgEl.getAttribute('data-group');
    }

    lightboxClose.addEventListener('click', () => {
        lightboxModal.style.display = 'none';
    });

    lightboxNext.addEventListener('click', () => {
        if (currentImageGroup.length > 0) {
            currentImageIndex = (currentImageIndex + 1) % currentImageGroup.length;
            showLightboxImage();
        }
    });

    lightboxPrev.addEventListener('click', () => {
        if (currentImageGroup.length > 0) {
            currentImageIndex = (currentImageIndex - 1 + currentImageGroup.length) % currentImageGroup.length;
            showLightboxImage();
        }
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (lightboxModal.style.display === 'block') {
            if (e.key === 'ArrowRight') lightboxNext.click();
            if (e.key === 'ArrowLeft') lightboxPrev.click();
            if (e.key === 'Escape') lightboxClose.click();
        }
    });

    // Order Re-arrangement Logic
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('order-left') || e.target.classList.contains('order-right')) {
            const idx = parseInt(e.target.getAttribute('data-idx'));
            const isLeft = e.target.classList.contains('order-left');
            
            if (isLeft && idx > 0) {
                const temp = currentDashboardData[idx];
                currentDashboardData[idx] = currentDashboardData[idx - 1];
                currentDashboardData[idx - 1] = temp;
            } else if (!isLeft && idx < currentDashboardData.length - 1) {
                const temp = currentDashboardData[idx];
                currentDashboardData[idx] = currentDashboardData[idx + 1];
                currentDashboardData[idx + 1] = temp;
            } else {
                return;
            }

            const newOrder = currentDashboardData.map(item => item.folder);
            localStorage.setItem('modelOrder', JSON.stringify(newOrder));
            renderDashboard(currentDashboardData);
        }
    });
});

