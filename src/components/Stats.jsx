import { money } from '../lib/utils.js';

export default function Stats({ s }) {
  return (
    <section className="stats">
      <div className="stat">
        <div className="label">Productos</div>
        <div className="value">{s.count}</div>
        <div className="sub">{s.avail} disponibles · {s.sold} vendidos</div>
      </div>
      <div className="stat amber">
        <div className="label">Total invertido</div>
        <div className="value">{money(s.invested)}</div>
        <div className="sub">Costo de compra</div>
      </div>
      <div className="stat purple">
        <div className="label">Valor potencial</div>
        <div className="value">{money(s.potential)}</div>
        <div className="sub">Venta de disponibles</div>
      </div>
      <div className="stat green">
        <div className="label">Ganancia</div>
        <div className="value">{money(s.profit)}</div>
        <div className="sub">Real {money(s.realProfit)} · Potencial {money(s.potentialProfit)}</div>
      </div>
    </section>
  );
}
