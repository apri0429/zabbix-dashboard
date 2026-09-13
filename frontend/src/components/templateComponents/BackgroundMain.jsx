import logoPiagam from './assets/logo-piagam2.png'

function BackgroundMain({ position = 'fixed', zIndex = -1 }) {
  return (
    <div aria-hidden="true" style={{ ...styles.root, position, zIndex }}>
      <div style={styles.texture} />
      <div style={styles.shapeTopRight} />
      <div style={styles.shapeBottomLeft} />
      <div style={styles.glowTopRight} />
      <div style={styles.glowBottomLeft} />
      <div style={styles.watermarkGlow} />
      <img src={logoPiagam} alt="" style={styles.watermark} />
    </div>
  )
}

// Background netral tapi tetap ada tekstur/kedalaman — bukan polos rata, tapi
// juga bukan yang rame warna-warni kayak sebelumnya. Cuma satu warna aksen
// (navy + teal, brand yang sama) dengan opacity rendah: tekstur titik halus,
// dua bentuk lengkung besar samar (kasih kedalaman), dan dua glow blur di
// pojok. Semuanya monokrom & lembut biar tetap kelihatan "diisi" tapi tetap
// rapi & profesional buat dashboard kerja.
const styles = {
  root: {
    inset: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
    background: 'linear-gradient(180deg, #fbfcfe 0%, #eef2f7 100%)',
  },
  texture: {
    position: 'absolute',
    inset: 0,
    opacity: 0.7,
    backgroundImage: 'radial-gradient(rgba(26, 42, 87, 0.16) 1px, transparent 1px)',
    backgroundSize: '26px 26px',
  },
  shapeTopRight: {
    position: 'absolute',
    top: '-20%',
    right: '-14%',
    width: '55%',
    height: '55%',
    borderRadius: '50%',
    background: 'radial-gradient(circle at center, rgba(26, 42, 87, 0.11) 0%, rgba(26, 42, 87, 0.11) 46%, rgba(26, 42, 87, 0) 74%)',
  },
  shapeBottomLeft: {
    position: 'absolute',
    bottom: '-22%',
    left: '-16%',
    width: '58%',
    height: '58%',
    borderRadius: '50%',
    background: 'radial-gradient(circle at center, rgba(42, 157, 143, 0.11) 0%, rgba(42, 157, 143, 0.11) 46%, rgba(42, 157, 143, 0) 74%)',
  },
  glowTopRight: {
    position: 'absolute',
    top: '-8%',
    right: '2%',
    width: '30%',
    height: '30%',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(26, 42, 87, 0.18) 0%, rgba(26, 42, 87, 0) 72%)',
    filter: 'blur(16px)',
  },
  glowBottomLeft: {
    position: 'absolute',
    bottom: '-6%',
    left: '4%',
    width: '32%',
    height: '32%',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(42, 157, 143, 0.16) 0%, rgba(42, 157, 143, 0) 72%)',
    filter: 'blur(18px)',
  },
  // Watermark logo piagam: ditampilkan pakai warna emas aslinya (bukan
  // di-mask jadi navy polos lagi) plus glow lembut di belakangnya biar
  // kesannya lebih menonjol & mewah, bukan sekadar tekstur samar.
  watermarkGlow: {
    position: 'absolute',
    bottom: '-14%',
    right: '-10%',
    width: '46%',
    maxWidth: '520px',
    aspectRatio: '1 / 1',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(233, 196, 106, 0.20) 0%, rgba(233, 196, 106, 0.08) 42%, rgba(233, 196, 106, 0) 72%)',
    filter: 'blur(6px)',
  },
  watermark: {
    position: 'absolute',
    bottom: '-6%',
    right: '-4%',
    width: '36%',
    maxWidth: '420px',
    aspectRatio: '1 / 1',
    objectFit: 'contain',
    opacity: 0.36,
    filter: 'drop-shadow(0 0 16px rgba(233, 196, 106, 0.28))',
    userSelect: 'none',
  },
}

export default BackgroundMain
