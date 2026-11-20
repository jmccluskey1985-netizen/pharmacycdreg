import { ImageResponse } from 'next/og';

// The picture shown when the site is shared (WhatsApp, LinkedIn, Facebook, Slack, iMessage).
export const alt = 'PharmacyCDReg.ie: electronic Controlled Drugs Register for Irish pharmacies';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '64px 72px', background: 'linear-gradient(160deg, #F1F8F0 0%, #FFFFFF 60%)', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <svg width="76" height="95" viewBox="0 0 104 130"><path d="M52 8C27 8 8 27 8 52c0 32 44 70 44 70s44-38 44-70C96 27 77 8 52 8z" fill="#54BD50" /><circle cx="52" cy="50" r="27" fill="#fff" /><rect x="45" y="33" width="14" height="34" rx="3.5" fill="#54BD50" /><rect x="35" y="43" width="34" height="14" rx="3.5" fill="#54BD50" /></svg>
          <div style={{ display: 'flex', fontSize: 64, fontWeight: 800, letterSpacing: -1 }}><span style={{ color: '#184B21' }}>Pharmacy</span><span style={{ color: '#54BD50' }}>CDReg</span><span style={{ color: '#184B21' }}>.ie</span></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ fontSize: 58, fontWeight: 800, color: '#0F172A', lineHeight: 1.1 }}>The digital Controlled Drugs Register for Irish pharmacies</div>
          <div style={{ fontSize: 30, color: '#475569' }}>Running balances · scanned invoices and prescriptions · stock checks against your Touchstore or MPS report · tamper-evident audit trail</div>
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 26, color: '#184B21', fontWeight: 700 }}>
          <span style={{ background: '#E6F4E5', borderRadius: 999, padding: '8px 22px' }}>For Irish community pharmacies</span>
          <span style={{ background: '#E6F4E5', borderRadius: 999, padding: '8px 22px' }}>Data kept in the EU</span>
          <span style={{ background: '#E6F4E5', borderRadius: 999, padding: '8px 22px' }}>First month free</span>
        </div>
      </div>
    ),
    size,
  );
}
