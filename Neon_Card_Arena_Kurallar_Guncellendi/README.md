# Neon Card Arena — 3 El Kurallı Sürüm

## Kurulum

Node.js 18 veya üstü gereklidir.

```bash
npm install
npm start
```

Ardından `http://localhost:3000` açın. Arkadaşlarınızla paylaşmak için GitHub'a yükleyip Render gibi Node.js + WebSocket destekleyen bir sunucuda Web Service olarak yayınlayın. Başlangıç komutu: `npm start`.

## Oyun kuralları

- Oda şifreli; iki oyuncu katılabilir.
- Sekiz ana karttan altısı **sırayla seçilir**, herkes üç kart alır; kalan iki kart oyunda kullanılmaz.
- İki taraf da maç başında **3D6** atar. Toplam kendi maçlık bütçesidir; sonraki ellerde bütçe yenilenmez.
- Maç **3 el** sürer, her elde bir ana kart oynanır. Kart maliyeti toplam bütçeyi aşamaz.
- Kartla beraber **2D6** otomatik atılır. Birinci zar saldırı bonusudur. İkinci zar kartın RAM gereksinimine eşitse veya fazlaysa bonus geçer; değilse bonus sıfır olur.
- İkinci zar ile kartın RAM gereksinimi arasındaki pozitif fark, o elin destek RAM kapasitesidir. Bu kapasite maçlar arasında birikmez.
- İki oyuncunun kartları eşleşene kadar rakibe açıklanmaz. Daha yüksek Power eli kazanır. Eşit güç: berabere ve puan yok. Üç el sonunda en fazla el kazanan maçın galibidir; eşitse maç berabere.
- Destek kartları için sunucuda `SUPPORT_CARDS` tanımı ve `attach-support` mekanizması yer alır; **kullanılabilir destek kartı görseli/değeri kullanıcı tarafından henüz sunulmadığından destek destesi boştur.** Şimdilik destek oynanamaz. Destek kartları ekleneceğinde oynama sonrası hazır onayı kullanılmalıdır.
- Kartların resimlerinde yazılı özel yetenekler bu özelleştirilmiş kurallarda otomatik uygulanmaz; yalnızca kartların cost/RAM/power değerleri kullanılır. `6+` sembollü Royce'un taban gücü 6'dır; çizgi maliyetler 0 kabul edilmiştir.
- Kartlar farklı bütçe ve dağıtım kombinasyonlarında oynanamayabilir (örneğin 3D6 sonucu düşükse Adam Smasher'a ulaşılamaz). Böyle bir durumda kullanıcı elini oynayamaz ve maç takılır. Bu sürüm bu uç durum için pas/geçme kuralı uygulamaz; gerekirse oda sahibi sıfırlayabilir. Oynanamayan kartlar için pas/otomatik kaybetme gibi yeni kural belirlenebilir.
- Oda verileri bellek içindedir; sunucu yeniden başlayınca kaybolur. Gerçek internet yayınında kalıcı oturum veritabanı önerilir.

## Teknik

- Express + Socket.IO, sunucu tarafı zarlar: `crypto.randomInt`.
- Şifreler salt ile `scrypt` hash biçiminde bellekte tutulur, açık şekilde geri gönderilmez.
- Oyuncu el bilgileri ve devam eden eldeki rakip kartı diğer oyuncuya gönderilmez.
