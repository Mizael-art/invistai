/** Abertura animada do TRADEON (~2,4 s) a cada vez que o app é aberto/recarregado (navegação interna não repete).
 *  Ativada por um script no <head> antes da primeira pintura (sem "piscar" o conteúdo). Com "reduzir movimento" a abertura é curta
 *  e estática. Não aparece para navegadores automatizados (testes), para não bloquear a interface deles. */
export const SPLASH_SCRIPT = `(function(){try{if(navigator.webdriver)return;var d=document.documentElement,r=matchMedia('(prefers-reduced-motion: reduce)').matches,t=r?700:2400;d.classList.add('splash');setTimeout(function(){d.classList.add('splash-out')},t);setTimeout(function(){d.classList.remove('splash','splash-out')},t+450)}catch(e){}})();`;
export function Splash() {
  return (<div className="splash-ov" aria-hidden="true">
    <div className="splash-in">
      <svg className="splash-mark" width="92" height="83" viewBox="0 0 30 27"><path className="b1" d="M3.2 26h5.6l2.6-9H5.8z" fill="#5FD83A" /><path className="b2" d="M11.2 26h5.6l4-14h-5.6z" fill="#7FEA4C" /><path className="b3" d="M19.2 26h5.6L30 7.5h-5.6z" fill="#9BFF62" /></svg>
      <div className="splash-word">TRADE<span>ON</span></div>
      <div className="splash-line"><i /></div>
    </div>
  </div>);
}
