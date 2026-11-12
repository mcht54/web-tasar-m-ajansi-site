import Script from "next/script";

// MCHT_OLCUM 1.0 — GA4 yalnız ziyaretçi çerez bandında "Kabul et" derse yüklenir (KVKK; ağdaki diğer sitelerle aynı davranış).
// Onaydan sonra telefon/WhatsApp/e-posta tıklaması ve form gönderimi "generate_lead" olayı olarak gider.
// GTM kimliği girilmişse eski davranış korunur (GTM içindeki onay ayarları GTM'den yönetilir).
const GIZLILIK = "https://www.mchttasarim.com.tr/gizlilik-politikasi/#cerezler";

const CSS = `#mcht-riza{position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483000;max-width:640px;margin:0 auto;background:#fff;color:#1a1a1a;border:1px solid #d9d9de;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.18);padding:16px 18px;font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
#mcht-riza[hidden]{display:none}#mcht-riza p{margin:0 0 12px}#mcht-riza a{color:inherit;text-decoration:underline}
#mcht-riza .mr-d{display:flex;gap:10px;flex-wrap:wrap}
#mcht-riza button{flex:1 1 140px;min-height:44px;border-radius:8px;font:600 15px/1 inherit;cursor:pointer;border:1px solid #1a1a1a}
#mcht-riza .mr-k{background:#1a1a1a;color:#fff}#mcht-riza .mr-r{background:#fff;color:#1a1a1a}
#mcht-riza button:focus-visible{outline:3px solid #2563eb;outline-offset:2px}
.mcht-riza-ac{background:none;border:0;padding:0;color:inherit;text-decoration:underline;cursor:pointer;font:inherit}`;

function olcumJs(gaId: string) {
  return `(function(){
var ID=${JSON.stringify(gaId)},K="mcht_riza",G=180*864e5,yuk=false;
function oku(){try{var v=localStorage.getItem(K);if(!v)return null;var o=JSON.parse(v);if(Date.now()-o.t>G)return null;return o.r;}catch(e){var m=document.cookie.match(/(?:^|; )mcht_riza=([01])/);return m?m[1]:null;}}
function yaz(r){try{localStorage.setItem(K,JSON.stringify({r:r,t:Date.now()}));}catch(e){document.cookie="mcht_riza="+r+";path=/;max-age=15552000;SameSite=Lax";}}
function ga(){if(yuk)return;yuk=true;window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){dataLayer.push(arguments);};
gtag("consent","default",{analytics_storage:"granted",ad_storage:"denied",ad_user_data:"denied",ad_personalization:"denied"});
gtag("js",new Date());gtag("config",ID,{anonymize_ip:true});
var s=document.createElement("script");s.async=true;s.src="https://www.googletagmanager.com/gtag/js?id="+encodeURIComponent(ID);document.head.appendChild(s);}
function aday(yol,etiket){if(!yuk||!window.gtag)return;gtag("event","generate_lead",{lead_method:yol,link_text:(etiket||"").slice(0,80),page_location:location.href});}
document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[href]");if(!a)return;var h=a.getAttribute("href")||"";
if(/^tel:/i.test(h))aday("telefon",h);else if(/wa\\.me|whatsapp\\.com|^whatsapp:/i.test(h))aday("whatsapp",h);else if(/^mailto:/i.test(h))aday("eposta",h);},true);
document.addEventListener("submit",function(e){var f=e.target;if(!f||f.matches("[role=search],.search-form"))return;if(f.querySelector("input[type=search],input[name=s],input[name=q]")&&!f.querySelector("textarea,input[type=email],input[type=tel]"))return;aday("form",f.getAttribute("id")||f.getAttribute("name")||f.getAttribute("aria-label")||"");},true);
var bant=document.getElementById("mcht-riza");
function goster(){if(bant){bant.hidden=false;var b=bant.querySelector(".mr-k");if(b)b.focus({preventScroll:true});}}
if(bant)bant.addEventListener("click",function(e){var b=e.target.closest("[data-riza]");if(!b)return;var r=b.getAttribute("data-riza");yaz(r);bant.hidden=true;if(r==="1")ga();});
document.addEventListener("click",function(e){if(e.target.closest&&e.target.closest(".mcht-riza-ac")){e.preventDefault();goster();}});
var r=oku();if(r==="1")ga();else if(r===null)goster();
})();`;
}

export function Analytics({ gaId, gtmId }: { gaId: string; gtmId: string }) {
  if (gtmId) {
    return (
      <Script id="gtm" strategy="lazyOnload">
        {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');`}
      </Script>
    );
  }
  if (!/^G-[A-Z0-9]{6,14}$/.test(gaId)) return null;
  return (
    <>
      <style id="mcht-olcum-css" dangerouslySetInnerHTML={{ __html: CSS }} />
      <div id="mcht-riza" role="dialog" aria-live="polite" aria-label="Çerez tercihi" hidden>
        <p>
          Sitemizi nasıl kullandığınızı anonim olarak ölçmek için Google Analytics çerezlerini kullanmak istiyoruz. Onay vermezseniz bu
          çerezler kullanılmaz; site aynı şekilde çalışır. Ayrıntılar: <a href={GIZLILIK}>Gizlilik ve çerez politikası</a>.
        </p>
        <div className="mr-d">
          <button type="button" className="mr-r" data-riza="0">Reddet</button>
          <button type="button" className="mr-k" data-riza="1">Kabul et</button>
        </div>
      </div>
      <p style={{ textAlign: "center", margin: "8px 0", fontSize: 13 }}>
        <button type="button" className="mcht-riza-ac">Çerez tercihleri</button>
      </p>
      <script id="mcht-olcum-js" dangerouslySetInnerHTML={{ __html: olcumJs(gaId) }} />
    </>
  );
}
