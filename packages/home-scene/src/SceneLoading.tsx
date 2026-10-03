import vantahomeMark from '../../../assets/brand/vantahome-mark-256.png?inline';
import './scene-loading.css';

/** Show indeterminate asset preparation without delaying the model's ready signal. */
export function SceneLoading() {
  return <div className="scene-loading" role="status" aria-atomic="true">
    <div className="scene-loading-grid" aria-hidden="true" />
    <div className="scene-loading-content">
      <div className="scene-loading-orbital" aria-hidden="true">
        <span className="scene-loading-perimeter" />
        <span className="scene-loading-orbit scene-loading-orbit-outer"><span className="scene-loading-node" /></span>
        <span className="scene-loading-orbit scene-loading-orbit-inner"><span className="scene-loading-node" /></span>
        <span className="scene-loading-core"><img src={vantahomeMark} width={256} height={256} alt="" /></span>
      </div>
      <div className="scene-loading-copy">
        <span className="scene-loading-brand" aria-hidden="true">VANTA<span>HOME</span></span>
        <p className="scene-loading-title">Preparing your home…</p>
        <p className="scene-loading-description">Loading the furnished house and landscape.</p>
      </div>
    </div>
  </div>;
}
