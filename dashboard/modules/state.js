// Global Durum ve Yapılandırmalar

export const state = {
  currentMargin: 40,
  siteMargins: { SITE_A: 40, SITE_B: 40, SITE_C: 40, SITE_D: 40, SITE_E: 40, SITE_F: 40, SITE_G: 40, SITE_H: 40 },
  siteDiscounts: { SITE_A: 0, SITE_B: 0, SITE_C: 0, SITE_D: 0, SITE_E: 0, SITE_F: 0, SITE_G: 0, SITE_H: 0 },
  currentCart: {},
  drawerTimeout: null, // Sepet çekmecesi otomatik kapanma zamanlayıcısı
  currentResults: [], // Arama sonuçlarını hafızada tutar
  selectedFilterSite: 'ALL', // Aktif filtrelenen site key (örn: SITE_C veya ALL)
  currentProductDiscounts: {}, // Ürün bazlı özel kalıcı iskontolar {productKey: {name, discount, domain}}
  keywordDiscounts: [], // Kelime bazlı otomatik iskontolar [{id, keyword, discount}]
  salesHistory: [], // Satış geçmişi
  exchangeRates: {
    USD: 33.00,
    EUR: 36.00,
    TRY: 1.00
  }
};

// Varsayılan B2B Arama Şablonları
export const DEFAULT_URLS = {
  url_site_a: "https://b4b.ozkaradenizinsaat.com/search/product/{query}",
  url_site_b: "https://b2b.enderyapi.com.tr/tr/urunler-s-{query}?page=1",
  url_site_c: "https://bayi.yasarteknik.com.tr/YeniSiparisGir.asp?F=Ara&FAdi={query}",
  url_site_d: "https://yenibayi.polisankansai.com/order/makeordernew?search={query}",
  url_site_e: "https://bayi.akyuztools.com/Search/SearchProduct",
  url_site_g: "https://www.nalburdayim.com/?search_provider=aisearch&query={query}&page=1",
  url_site_h: "https://b2b.kamilturk.com/Arama/_Prbx?q={query}"
};

// Fırat Boru Görsel Eşleştirme Listesi
export const FIRAT_IMAGES = [
  "2001002300.jpeg", "7011050045.png", "7011050087.png", "7012070050.png", "7012100050.png",
  "7013050050.png", "7013070050.png", "7013070070.png", "7014050050.png", "7014070050.png",
  "7014070070.png", "7014500100.png", "7015050050.png", "7016001070.png", "7016001100.png",
  "7016001110.png", "7016001125.png", "7016002100.png", "7016002145.png", "7016002175.png",
  "7016003100.png", "7016004050.png", "7016004070.png", "7016004150.png", "7016004200.png",
  "7016006200.png", "7016006250.png", "7016006315.png", "7016007050.png", "7016007070.png",
  "7017000100.png", "7026050050.jpeg", "7030050015.jpeg", "7040150401.jpeg", "7041078300.jpeg",
  "7042100006.jpeg", "7042100007.jpeg", "7042100008.jpeg", "7042100009.jpeg", "7042100010.jpeg",
  "7042100011.jpeg", "7042100012.jpeg", "7042100013.jpeg", "7042100014.jpeg", "7042100015.jpeg",
  "7042125006.jpeg", "7042140001.jpeg", "7042140002.jpeg", "7042140003.jpeg", "7042140005.jpeg",
  "7042140008.jpeg", "7042140009.jpeg", "7042140010.jpeg", "7042140011.jpeg", "7042140012.jpeg",
  "7042140013.jpeg", "7042140014.jpeg", "7042140015.jpeg", "7042140016.jpeg", "7042140017.jpeg",
  "7052050015.jpeg", "7052100015.jpeg", "7052200200.png", "7052200300.png", "7054050015.png",
  "7054150300.jpeg", "7054150600.jpeg", "7071050045.png", "7071050087.png", "7072070050.png",
  "7072100050.png", "7072150125.png", "7073050050.png", "7073070050.png", "7073070070.png",
  "7073200150.png", "7073200200.png", "7074050050.png", "7074070050.png", "7074070070.png",
  "7074150125.png", "7074150150.png", "7075050050.png", "7075070050.png", "7075070070.png",
  "7075100100.png", "7075125100.png", "7076001070.png", "7076001100.png", "7076001125.png",
  "7076003100.png", "7076004050.png", "7076004070.png", "7076004125.png", "7076004150.png",
  "7076007050.png", "7076007070.png", "7076007150.png", "70K1015005.jpeg", "70K6220012.png",
  "7120000001.jpeg", "7120000005.jpeg", "7120000011.jpeg", "7301000040.jpeg", "7301000080.jpeg",
  "7301000100.jpeg", "7301000127.jpeg", "7301000255.jpeg", "7301000508.jpeg", "7302004008.jpeg",
  "7302009014.jpeg", "7302010016.jpeg", "7303050849.jpeg", "7304000127.jpeg", "7307080000.jpeg",
  "7307100000.jpeg", "7321000191.jpeg", "7321000191K.png", "7321000191M.jpeg", "7321000318.jpeg",
  "7321000381.jpeg", "7322000254Y.jpeg", "7322000762Y.jpeg", "7322001016Y.jpeg", "7323000254S.jpeg",
  "7323000762S.jpeg", "7323001016S.jpeg", "7324000254K.jpeg", "7324000762K.jpeg", "7324001016K.jpeg",
  "7325001016.jpeg", "7350000127.jpeg", "7350000254.jpeg", "7350000318.jpeg", "7351000127.jpeg",
  "7351000254.jpeg", "7351000318.jpeg", "7354000127.jpeg", "7354000254.jpeg", "7354000318.jpeg",
  "7357000060.jpeg", "7357000080.jpeg", "7357000100.jpeg", "7358000127K.jpeg", "7358000127S.jpeg",
  "7400100150.jpeg", "7401000127.jpeg", "7401000254.jpeg", "7401000318.jpeg", "7402000060.jpeg",
  "7402000080.jpeg", "7402000100.jpeg", "7404000127.jpeg", "7404000159.jpeg", "7404000191.jpeg",
  "7405000100.jpeg", "7405000120.jpeg", "7406000254.jpeg", "7408000001.jpeg", "7408000004.jpeg",
  "7408000005.jpeg", "7408100001.jpeg", "7408100004.jpeg", "7408100005.jpeg", "7408200000.jpeg",
  "7408200003.jpeg", "7408200004.jpeg", "7409117503.jpeg", "7409117504.jpeg", "7409117506.jpeg",
  "7420000127.jpeg", "7420000191.jpeg", "7420000254.jpeg", "74900010016.png", "74900020016.png",
  "7490003016K.png", "7490003016M.png", "7490003116K.png", "7490003116M.png", "74910000016.jpeg",
  "74920000016.jpeg", "74930000016.png", "7494002525.jpeg", "7496000015.png", "7496000016.png",
  "7496000115K.png", "7496000115M.png", "7496000116K.png", "7496000116M.png", "7496000215.png",
  "7496010016.png", "7496010016K.png", "7496010016M.png", "7496020016.png", "7496020016K.png",
  "7496020016M.png", "7500060020L.jpeg", "7500060090L.jpeg", "7500100020L.jpeg", "7500100025L.jpeg",
  "7500100075L.jpeg", "7500100090L.jpeg", "7501060020M.jpeg", "7501060063M.jpeg", "7501060075M.jpeg",
  "7501100020M.jpeg", "7517000090.jpeg", "7517000093.jpeg", "7517000110.jpeg", "7584110125M.jpeg",
  "7584210300M.jpeg", "7588001111.jpeg", "7588210401M.jpeg", "75891000101.jpeg", "75891000800.jpeg",
  "75891001000.jpeg", "75892000101.jpeg", "75892000800.jpeg", "75892001000.jpeg", "75893000101.jpeg",
  "75893000800.jpeg", "75893001000.jpeg", "75893150100.jpeg", "75893400250.jpeg", "75893400300.jpeg",
  "75894011010.jpeg", "75894011510.jpeg", "75894012020.jpeg", "75894013030.jpeg", "75894014015.jpeg",
  "75894014020.jpeg", "75894125100.jpeg", "75895000100.jpeg", "75896100101.jpeg", "758M8000800.jpeg",
  "758M8001000.jpeg", "758M800110M.jpeg", "758MP400500.jpeg", "758MP410125.jpeg", "758MP410250.jpeg",
  "758MP800110.jpeg", "758MP800500.jpeg", "758MP800600.jpeg", "758MP800800.jpeg", "758MP801000.jpeg",
  "758MP810125.jpeg", "758MP810250.jpeg", "758P4000150.jpeg", "758P4000200.jpeg", "758P4000300.jpeg",
  "758P4000400.jpeg", "758P8000150.jpeg", "758P8000300.jpeg", "758P8000400.jpeg", "7680000100.png",
  "7800110100.jpeg", "7800110200.jpeg", "7800110300.jpeg", "7800110400.jpeg", "7800110500.jpeg",
  "7800110600.jpeg", "7800110620.png", "7800110650.jpeg", "7800110700.jpeg", "7800110720.png",
  "7800110750.jpeg", "7800110800.jpeg", "7800110950.jpeg", "7800110960.jpeg", "7800111000K.jpeg",
  "7800111000M.jpeg", "7800111100K.jpeg", "7800111100M.jpeg", "7800111200K.jpeg", "7800111200M.jpeg",
  "7800111300K.jpeg", "7800111300M.jpeg", "7800150001.jpeg", "7800150005.jpeg", "7800150006.jpeg",
  "7800160001.jpeg", "7800160005.jpeg", "7800160006.jpeg", "7800165001.jpeg", "7800170001.jpeg",
  "7800170005.jpeg", "7800170006.jpeg", "7800210200.jpeg", "7800220000.jpeg", "7800220200.jpeg",
  "7800221200.jpeg", "7819990090.jpeg", "7819990340.jpeg", "7819990410.jpeg", "7819999610.jpeg",
  "7819999800.jpeg", "7B00014020.jpeg", "7B00014160.jpeg", "7B00020020.jpeg", "7B00020126.jpeg",
  "7B00020127.jpeg", "7B00023020.jpeg", "7B00023110.jpeg", "7B00023126.jpeg", "7B00024020.jpeg",
  "7B00024025.jpeg", "7B00120020.jpeg", "7B00120032.jpeg", "7B00120040.jpeg", "7B00130020.jpeg",
  "7B00130025.jpeg", "7B00140020.jpeg", "7B00140025.jpeg", "7B00150020.jpeg", "7B11000020.jpeg",
  "7B11001020.jpeg", "7B11001050.jpeg", "7B11001063.jpeg", "7B11002020.jpeg", "7B11002025.jpeg",
  "7B11002032.jpeg", "7B11003020.jpeg", "7B11003025.jpeg", "7B11003120.jpeg", "7B11003125.jpeg",
  "7B21000020.jpeg", "7B21000125.jpeg", "7B21000160.jpeg", "7B23025020.jpeg", "7B23025025.jpeg",
  "7B31000020.jpeg", "7B32000020.jpeg", "7B32000025.jpeg", "7B32010020.jpeg", "7B32020020.jpeg",
  "7B33000021.jpeg", "7B33000026.png", "7B33000034.png", "7B35000020.jpeg", "7B35000032.jpeg",
  "7B35000040.jpeg", "7B41000020.jpeg", "7B41000125.jpeg", "7B41000160.jpeg", "7B42252020.jpeg",
  "7B42634063.jpeg", "7B42635063.jpeg", "7B43322020.jpeg", "7B44000020.jpeg", "7B44000025.jpeg",
  "7B44000032.jpeg", "7B51032254.jpeg", "7B52020127.jpeg", "7B52032127.jpeg", "7B52032191.jpeg",
  "7B54020127.jpeg", "7B54032127.jpeg", "7B54032191.jpeg", "7B63032254.jpeg", "7B63090762.jpeg",
  "7B631101016.jpeg", "7B65020191.jpeg", "7B66020191.jpeg", "7B66050191.jpeg", "7B66063191.jpeg",
  "7B72120127.jpeg", "7B74020127.jpeg", "7B74032191.jpeg", "7B74032192.jpeg", "7B75020127.jpeg",
  "7B75025191.jpeg", "7B75032254.jpeg", "7B76020127.jpeg", "7B76025191.jpeg", "7B76032254.jpeg",
  "7B77020127.jpeg", "7B77025191.jpeg", "7B77032254.jpeg", "7B78025254.jpeg", "7B80020128.jpeg",
  "7B80025127.png", "7B81021127.png", "7B81025127.jpeg", "7B83520127.jpeg", "8171050050.png",
  "8171050075.png", "8171050110.png", "8171050160.png", "8171050200.png", "8171055050.png",
  "8171055075.png", "8171055110.png", "8171055160.png", "8171055200.png", "8171060050.png",
  "8171060075.png", "8171060110.png"
];
