'use strict';

// Regresión logística en JS puro (sin dependencias). Clasificador binario
// entrenado por descenso de gradiente con estandarización de features y
// regularización L2. Interpretable: los pesos dicen qué feature empuja la
// decisión, así que cada predicción es explicable (nada de caja negra).

function sigmoid(z) { return 1 / (1 + Math.exp(-z)); }

class LogisticRegression {
  constructor({ lr = 0.1, epochs = 400, l2 = 0.001 } = {}) {
    this.lr = lr; this.epochs = epochs; this.l2 = l2;
    this.w = null; this.b = 0; this.mean = null; this.std = null;
  }

  _standardizeFit(X) {
    const n = X.length, d = X[0].length;
    this.mean = new Array(d).fill(0);
    this.std = new Array(d).fill(0);
    for (const row of X) for (let j = 0; j < d; j++) this.mean[j] += row[j] / n;
    for (const row of X) for (let j = 0; j < d; j++) this.std[j] += (row[j] - this.mean[j]) ** 2 / n;
    for (let j = 0; j < d; j++) this.std[j] = Math.sqrt(this.std[j]) || 1;
  }
  _standardize(row) {
    return row.map((v, j) => (v - this.mean[j]) / this.std[j]);
  }

  fit(X, y) {
    this._standardizeFit(X);
    const Xs = X.map(r => this._standardize(r));
    const n = Xs.length, d = Xs[0].length;
    this.w = new Array(d).fill(0);
    this.b = 0;
    for (let e = 0; e < this.epochs; e++) {
      const gw = new Array(d).fill(0);
      let gb = 0;
      for (let i = 0; i < n; i++) {
        const p = sigmoid(this.w.reduce((s, wj, j) => s + wj * Xs[i][j], this.b));
        const err = p - y[i];
        for (let j = 0; j < d; j++) gw[j] += err * Xs[i][j] / n;
        gb += err / n;
      }
      for (let j = 0; j < d; j++) this.w[j] -= this.lr * (gw[j] + this.l2 * this.w[j]);
      this.b -= this.lr * gb;
    }
    return this;
  }

  proba(row) {
    const xs = this._standardize(row);
    return sigmoid(this.w.reduce((s, wj, j) => s + wj * xs[j], this.b));
  }

  // Aporte de cada feature a esta predicción concreta (para explicabilidad):
  // peso × valor estandarizado. Positivo empuja hacia la clase 1.
  contributions(row) {
    const xs = this._standardize(row);
    return this.w.map((wj, j) => wj * xs[j]);
  }

  toJSON() { return { w: this.w, b: this.b, mean: this.mean, std: this.std }; }
  static fromJSON(o) {
    const m = new LogisticRegression();
    m.w = o.w; m.b = o.b; m.mean = o.mean; m.std = o.std;
    return m;
  }
}

// Métricas de clasificación binaria a partir de predicciones y etiquetas.
function metrics(yTrue, yProb, thr = 0.5) {
  let tp = 0, tn = 0, fp = 0, fn = 0;
  for (let i = 0; i < yTrue.length; i++) {
    const pred = yProb[i] >= thr ? 1 : 0;
    if (pred === 1 && yTrue[i] === 1) tp++;
    else if (pred === 0 && yTrue[i] === 0) tn++;
    else if (pred === 1 && yTrue[i] === 0) fp++;
    else fn++;
  }
  const acc = (tp + tn) / (yTrue.length || 1);
  const precision = tp / (tp + fp || 1);
  const recall = tp / (tp + fn || 1);
  const f1 = 2 * precision * recall / (precision + recall || 1);
  return { acc, precision, recall, f1, tp, tn, fp, fn };
}

module.exports = { LogisticRegression, metrics, sigmoid };
