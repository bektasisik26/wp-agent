# wp-agent: Anadolu Yapı WhatsApp botu ve lead paneli

## Kurulum (Windows, ilk kez)

1. **Node.js kur.** nodejs.org adresinden LTS sürümünü (20 ya da 22) indirip kur. Sonra PowerShell'i kapatıp yeniden aç ve `node -v` yazıp sürümün çıktığını gör.
2. **Dosyaları yerleştir.** Bu ZIP'in içindekileri `Masaüstü\wp-agent` klasörüne çıkar. `package.json` dosyası klasörün hemen içinde görünmeli. Klasörde eski bir `.env` dosyası varsa **sil** (eski anahtar içerebilir).
3. **`.env.local` dosyasını doldur** (Not Defteri ile açabilirsin). Şu dördü zorunlu:
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase > wp-agent projesi > Project Settings > API sayfasındaki anon (publishable) anahtar.
   - `SUPABASE_SERVICE_ROLE_KEY`: aynı sayfadaki service_role (secret) anahtar. **Sohbete yapıştırdığın eski anahtarı yenile (rotate), yenisini yaz.**
   - `ALLOWED_EMAILS`: kendi e-postan.
   - `VAPID_SUBJECT`: `mailto:` yanına e-postan.
   Botu denemek için `GEMINI_API_KEY` da gerekir (aistudio.google.com/apikey).
4. **Kendine giriş hesabı aç.** Supabase > Authentication > Users > Add user. E-posta, `ALLOWED_EMAILS`'e yazdığınla aynı olsun. Şifre belirle ve "Auto Confirm User" kutusunu işaretle. Authentication ayarlarında yeni kullanıcı kaydı (sign up) kapalı olsun.
5. **Çalıştır.** PowerShell'de:
   ```
   cd $env:USERPROFILE\Desktop\wp-agent
   npm install
   npm run dev
   ```
   Tarayıcıda http://localhost:3000 adresini aç ve giriş yap.

Veritabanı tabloları Supabase projesinde zaten kurulu, ayrıca SQL çalıştırman gerekmez.

## Girişten sonra
- **Ekip:** her satışçıya ayrı e-posta ve şifreyle hesap aç.
- **Bot ayarları:** işletme bilgisi, saatler, devir kuralları, SSS, doküman, bot dışı numaralar, bildirim ayarları.
- **Inbox, Leadler:** konuşmalar, lead'ler, etiketler, atama.

## Yerelde çalışanlar ve çalışmayanlar
- Çalışır: giriş, ekip, ayarlar, Inbox/Leadler ekranları, veritabanı işlemleri.
- Çalışmaz: WhatsApp'tan gelen mesajları almak (Evolution senin bilgisayarına ulaşamaz), anlık bildirim ve uygulama olarak yükleme (canlı adres gerekir), 10 dakikalık zamanlayıcı (takip, bağlantı ve bekleme kontrolü). Bunlar canlıya (Vercel) çıkınca devreye girer.

## Sorun çıkarsa
- `npm run dev` sırasında kırmızı hata: tamamını kopyalayıp bana yapıştır.
- PowerShell "betik çalıştırma devre dışı" derse: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` yazıp onayla.
- Tip hatalarını topluca görmek için: `npm run build`.
- Giriş yapamıyorsan: e-posta `ALLOWED_EMAILS` ile aynı mı, Supabase'de kullanıcı onaylı mı (Auto Confirm) kontrol et.
