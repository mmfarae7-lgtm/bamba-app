import { useEffect, useState } from 'react';
import { CheckCircle2, ImageIcon, Loader2, ShoppingBag, Store, Trash2, Upload } from 'lucide-react';
import { supabase } from './lib/supabase';
import { deleteStoreFile, storeFileUrl, uploadStoreFile } from './lib/store';
import type { StorePartner, StoreProduct } from './lib/store';

const CATEGORIES = ['محل رياضي', 'مطعم', 'متجر', 'خدمات', 'شركة'];
const DISCOUNTS = [20, 50, 70];
const PRODUCT_CATEGORIES = ['ملابس', 'أدوات', 'مطاعم', 'هدايا', 'أخرى'];

let flashTimer = 0;

export function StoreSection() {
  const [tab, setTab] = useState<'partners' | 'products'>('partners');
  const [partners, setPartners] = useState<StorePartner[]>([]);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const flash = (m: string) => {
    setMsg(m);
    window.clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => setMsg(''), 3500);
  };

  const refresh = async () => {
    const [p, pr] = await Promise.all([
      supabase.from('store_partners').select('*').order('created_at', { ascending: true }),
      supabase.from('store_products').select('*').order('created_at', { ascending: true }),
    ]);
    setPartners((p.data ?? []) as StorePartner[]);
    setProducts((pr.data ?? []) as StoreProduct[]);
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  const deletePartner = async (partner: StorePartner) => {
    if (!window.confirm(`حذف الشريك ${partner.name}؟ سيُحذف شعاره أيضاً.`)) return;
    if (partner.logo_url) await deleteStoreFile(partner.logo_url);
    const { error } = await supabase.from('store_partners').delete().eq('id', partner.id);
    flash(error ? `فشل الحذف: ${error.message}` : 'تم حذف الشريك ✓');
    void refresh();
  };

  const deleteProduct = async (product: StoreProduct) => {
    if (!window.confirm(`حذف المنتج ${product.name}؟`)) return;
    if (product.image_url) await deleteStoreFile(product.image_url);
    const { error } = await supabase.from('store_products').delete().eq('id', product.id);
    flash(error ? `فشل الحذف: ${error.message}` : 'تم حذف المنتج ✓');
    void refresh();
  };

  return (
    <div className="admin-content store-admin">
      <div className="admin-section-intro">
        <div>
          <span className="eyebrow">المتجر والجوائز</span>
          <h2>الشركاء والمنتجات</h2>
          <p>أضف محلات ومطاعم ومتاجر بعد التنسيق معهم، ارفع شعارهم، ثم أضف منتجاتهم مع صورهم الحقيقية. كل شريك يمنح قسيمة خصم (20% / 50% / 70%).</p>
        </div>
        <span className="admin-count">{products.length} منتج • {partners.length} شريك</span>
      </div>

      {msg && <div className="store-msg" data-testid="store-admin-msg"><CheckCircle2 size={16} /> {msg}</div>}

      <div className="store-admin-tabs">
        <button className={tab === 'partners' ? 'active' : ''} onClick={() => setTab('partners')}><Store size={16} /> الشركاء ({partners.length})</button>
        <button className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}><ShoppingBag size={16} /> المنتجات ({products.length})</button>
      </div>

      {loading ? (
        <div className="admin-loading"><Loader2 size={24} className="spin" /><p>جاري تحميل المتجر...</p></div>
      ) : tab === 'partners' ? (
        <div className="store-admin-layout">
          <PartnerForm onSaved={(m) => { flash(m); void refresh(); }} onBusy={setBusy} busy={busy} />
          <div className="store-admin-list">
            <h3>الشركاء المعتمدون</h3>
            {partners.length === 0 && <div className="admin-empty"><Store size={20} /><span>لا يوجد شركاء بعد — أضف أول شريك من النموذج.</span></div>}
            {partners.map((partner) => (
              <div className="store-admin-item" key={partner.id}>
                {partner.logo_url ? (
                  <img className="store-thumb" src={storeFileUrl(partner.logo_url) ?? ''} alt={partner.name} />
                ) : (
                  <span className="store-thumb store-thumb-fallback"><Store size={18} /></span>
                )}
                <div className="store-admin-info"><b>{partner.name}</b><small>{partner.category} • خصم {partner.discount}%</small></div>
                <span className="store-admin-badge">{partner.discount}%</span>
                <button className="store-admin-del" onClick={() => void deletePartner(partner)} aria-label="حذف"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="store-admin-layout">
          <ProductForm partners={partners} onSaved={(m) => { flash(m); void refresh(); }} onBusy={setBusy} busy={busy} />
          <div className="store-admin-list">
            <h3>منتجات المتجر</h3>
            {products.length === 0 && <div className="admin-empty"><ShoppingBag size={20} /><span>لا توجد منتجات بعد — أضف أول منتج من النموذج.</span></div>}
            {products.map((product) => {
              const partner = partners.find((p) => p.id === product.partner_id);
              return (
                <div className="store-admin-item" key={product.id}>
                  {product.image_url ? (
                    <img className="store-thumb" src={storeFileUrl(product.image_url) ?? ''} alt={product.name} />
                  ) : (
                    <span className="store-thumb store-thumb-fallback"><ShoppingBag size={18} /></span>
                  )}
                  <div className="store-admin-info"><b>{product.name}</b><small>{partner?.name ?? 'بدون شريك'} • {product.category}</small></div>
                  <span className="store-admin-price">{product.price_bamba.toLocaleString()} بمبة</span>
                  <button className="store-admin-del" onClick={() => void deleteProduct(product)} aria-label="حذف"><Trash2 size={16} /></button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ===== نموذج إضافة شريك ===== */
function PartnerForm({ onSaved, onBusy, busy }: { onSaved: (m: string) => void; onBusy: (b: boolean) => void; busy: boolean }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [discount, setDiscount] = useState(50);
  const [logo, setLogo] = useState<File | null>(null);

  const submit = async () => {
    if (!name.trim()) { onSaved('اكتب اسم الشريك أولاً'); return; }
    onBusy(true);
    let logoUrl: string | null = null;
    if (logo) {
      const up = await uploadStoreFile('partners', logo);
      if (up.error) { onSaved(`فشل رفع الشعار: ${up.error}`); onBusy(false); return; }
      logoUrl = up.path;
    }
    const { error } = await supabase.from('store_partners').insert({
      name: name.trim(), category, description: description.trim() || null, discount, logo_url: logoUrl,
    });
    onBusy(false);
    if (error) { onSaved(`فشل الحفظ: ${error.message}`); return; }
    setName(''); setDescription(''); setLogo(null);
    onSaved(`تمت إضافة الشريك «${name.trim()}» بخصم ${discount}% ✓`);
  };

  return (
    <section className="store-form-card">
      <h3><Store size={17} /> إضافة شريك جديد</h3>
      <label className="full-label">اسم الشريك / المحل / المطعم<input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: متجر سبورت تايم" data-testid="partner-name" /></label>
      <label className="full-label">التصنيف
        <select value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
      </label>
      <label className="full-label">وصف قصير<input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="ملابس وأدوات رياضية أصلية..." /></label>
      <label className="full-label">نسبة قسيمة الخصم
        <div className="discount-chips">
          {DISCOUNTS.map((d) => <button type="button" key={d} className={discount === d ? 'selected' : ''} onClick={() => setDiscount(d)}>{d}%</button>)}
        </div>
      </label>
      <label className="full-label">شعار الشريك
        <div className="store-upload">
          <input id="partner-logo" type="file" accept="image/png,image/jpeg,image/webp" data-testid="partner-logo-input" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
          <label htmlFor="partner-logo" className="store-upload-box">
            <Upload size={18} />
            <span>{logo ? logo.name : 'اضغط لاختيار صورة الشعار (PNG / JPG / WebP)'}</span>
          </label>
        </div>
      </label>
      <button className="primary-button" disabled={busy} onClick={() => void submit()} data-testid="partner-submit">
        {busy ? <><Loader2 size={17} className="spin" /> جارٍ الحفظ...</> : <>إضافة الشريك <CheckCircle2 size={17} /></>}
      </button>
    </section>
  );
}

/* ===== نموذج إضافة منتج ===== */
function ProductForm({ partners, onSaved, onBusy, busy }: { partners: StorePartner[]; onSaved: (m: string) => void; onBusy: (b: boolean) => void; busy: boolean }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(PRODUCT_CATEGORIES[0]);
  const [price, setPrice] = useState('');
  const [discount, setDiscount] = useState(50);
  const [partnerId, setPartnerId] = useState('');
  const [image, setImage] = useState<File | null>(null);

  const submit = async () => {
    if (!name.trim()) { onSaved('اكتب اسم المنتج أولاً'); return; }
    const priceValue = Number.parseInt(price, 10);
    if (Number.isNaN(priceValue) || priceValue <= 0) { onSaved('اكتب السعر بالبمبات (رقم صحيح)'); return; }
    onBusy(true);
    let imageUrl: string | null = null;
    if (image) {
      const up = await uploadStoreFile('products', image);
      if (up.error) { onSaved(`فشل رفع الصورة: ${up.error}`); onBusy(false); return; }
      imageUrl = up.path;
    }
    const { error } = await supabase.from('store_products').insert({
      name: name.trim(), description: description.trim() || null, category,
      price_bamba: priceValue, discount, partner_id: partnerId || null, image_url: imageUrl,
    });
    onBusy(false);
    if (error) { onSaved(`فشل الحفظ: ${error.message}`); return; }
    setName(''); setDescription(''); setPrice(''); setImage(null);
    onSaved(`تمت إضافة المنتج «${name.trim()}» ✓`);
  };

  return (
    <section className="store-form-card">
      <h3><ShoppingBag size={17} /> إضافة منتج جديد</h3>
      <label className="full-label">اسم المنتج<input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: قميص النادي الرسمي" data-testid="product-name" /></label>
      <label className="full-label">وصف قصير<input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="قميص أصلي بمقاسات متعددة..." /></label>
      <div className="store-form-two">
        <label className="full-label">التصنيف
          <select value={category} onChange={(e) => setCategory(e.target.value)}>{PRODUCT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        </label>
        <label className="full-label">السعر (بمبة)
          <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ''))} placeholder="950" inputMode="numeric" data-testid="product-price" />
        </label>
      </div>
      <div className="store-form-two">
        <label className="full-label">الشريك
          <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} data-testid="product-partner">
            <option value="">بدون شريك</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="full-label">الخصم
          <select value={discount} onChange={(e) => setDiscount(Number(e.target.value))}>{DISCOUNTS.map((d) => <option key={d} value={d}>{d}%</option>)}</select>
        </label>
      </div>
      <label className="full-label">صورة المنتج
        <div className="store-upload">
          <input id="product-image" type="file" accept="image/png,image/jpeg,image/webp" data-testid="product-image-input" onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
          <label htmlFor="product-image" className="store-upload-box">
            <ImageIcon size={18} />
            <span>{image ? image.name : 'اضغط لاختيار صورة المنتج (PNG / JPG / WebP)'}</span>
          </label>
        </div>
      </label>
      <button className="primary-button" disabled={busy} onClick={() => void submit()} data-testid="product-submit">
        {busy ? <><Loader2 size={17} className="spin" /> جارٍ الحفظ...</> : <>إضافة المنتج <CheckCircle2 size={17} /></>}
      </button>
    </section>
  );
}