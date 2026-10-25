# YOLOv11 Model Karşılaştırma ve Analiz Dashboard'u

Bu proje, eğittiğiniz farklı YOLOv8 nesne tespiti (object detection) modellerinin doğrulama (validation) sonuçlarını kıyaslamak, detaylıca incelemek ve metriklerini görselleştirmek için geliştirilmiş kullanışlı bir web uygulamasıdır.

## Proje Yapısı

- **`app.py`**: Web arayüzünü sunan ve arka planda model değerlendirme işlemlerini yürüten ana Flask uygulamasıdır.
- **`evaluate_model.ipynb` (veya sizin değiştirdiğiniz adıyla `modeli_dene.ipynb`)**: Modellerin metriklerini (mAP, F1, Confusion Matrix vb.) hesaplayan ve analiz sonuçlarını dışa aktaran Jupyter Notebook dosyasıdır. 
- **`analiz*/` klasörleri**: Değerlendirmesi tamamlanan modellerin ürettiği raporların, CSV formatındaki metriklerin ve hata matrisi gibi grafiklerin tutulduğu sonuç dizinleridir.
- **`templates/` & `static/`**: Kullanıcı dostu web arayüzünün (Dashboard) HTML, CSS ve JavaScript kaynak kodlarıdır.

## Kurulum ve Gereksinimler

Terminal veya komut satırınızdan gerekli kütüphaneleri kurun:

```bash
pip install flask ultralytics pandas matplotlib jupyter
```
*(Not: Jupyter Notebook dosyasının çalışması için gerekli olabilecek ek veri bilimi kütüphanelerinin sisteminizde yüklü olduğundan emin olun.)*

---

## 🛠️ Kendi Projenize Uyarlamak İçin Nereleri Değiştirmelisiniz?

Bu şablonu kendi veri setiniz ve modelleriniz ile kullanmak isterseniz aşağıdaki değişiklikleri yapmanız gerekir:

### 1. Ana Notebook İsmini Ayarlama
Eğer `.ipynb` dosyanızın ismini (örneğin `modeli_dene.ipynb` olarak) değiştirdiyseniz:
* `app.py` dosyasını açın.
* Yaklaşık 12. satırda yer alan `NOTEBOOK_PATH = "evaluate_model.ipynb"` değişkenini, **kendi dosya adınız** olacak şekilde güncelleyin.

### 2. Veri Seti (Dataset .yaml) Yolunu Güncelleme
Uygulamanın sizin veri setiniz üzerinde test (validation) yapabilmesi için:
* Kullanacağınız Notebook dosyasını (`modeli_dene.ipynb`) açın.
* YOLOv8 doğrulama adımının yapıldığı `model.val(...)` kodunu bulun.
* Oradaki `data='...'` parametresini kendi projenizdeki `.yaml` dosyasının (örneğin `data='benim_verim/dataset.yaml'`) yoluyla değiştirin.

### 3. Sınıf (Class) İsimlerini Değiştirme
Grafiklerde ve tablolarda şu anda muhtemelen "uçak" ve "background" yazıyor:
* Notebook dosyanızda Confusion Matrix çizdiren veya çıktı veren bölümlerdeki class isimlerini kendi etiketlerinize (örneğin "araba", "insan", "hata") göre güncelleyin.

### 4. Obje Boyut Gruplarını (Küçük, Orta, Büyük) Kendinize Göre Ayarlama
Kod içerisinde objeler piksel bazında sınıflandırılmaktadır (örneğin 0-16px Çok Küçük, 16-32px Küçük).
* Sizin projenizde "Küçük" objenin boyutu 50 piksel, "Büyük" objenin boyutu 200 piksel olabilir.
* Notebook içerisindeki ilgili threshold (eşik) sınırlarını bulup, kendi boyut tanımınıza göre yeniden düzenlemelisiniz.

### 5. Yeni Modelleri (.pt) Sisteme Gönderme
Sistem arka planda aldığı model yollarını sırayla dener. Uygulamaya yeni eğittiğiniz bir modeli vermek isterseniz:
* API üzerinden `/api/evaluate` uç noktasına bir POST isteği atabilirsiniz. (Örneğin Postman kullanarak veya küçük bir Python scripti ile):
  ```json
  {
      "models": ["C:/projelerim/yeni_model_best.pt", "C:/projelerim/diger_model.pt"]
  }
  ```
* *Alternatif olarak;* geliştirici iseniz `templates/index.html` arayüzüne dosya seçebileceğiniz küçük bir "Model Ekle" butonu tasarımı ekleyip `app.py`'ye bağlayabilirsiniz.

---

## Nasıl Çalıştırılır?

Tüm uyarlamaları yaptıktan sonra:
1. Terminali açın ve `python app.py` komutuyla sunucuyu başlatın.
2. Tarayıcınızdan **[http://localhost:5000](http://localhost:5000)** adresine gidin.
3. Dashboard üzerindeki "Refresh Results" butonu ile biten tüm analizleri yükleyin.
4. Model kartlarındaki `(Düzenle)` ikonuna tıklayarak uzun `.pt` isimleri yerine "Model V1 - 100 Epoch" gibi okunabilir isimler tanımlayın.
