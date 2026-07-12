import { Component } from 'react';

// Error boundary global: un throw en cualquier render dejaba la SPA en blanco.
// Aquí se captura y se muestra una pantalla de recuperación en vez de romperse.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="text-5xl">♠</div>
          <h1 className="text-xl font-bold">Algo salió mal</h1>
          <p className="text-sm text-gray-400 max-w-sm">Ocurrió un error inesperado. Puedes recargar para continuar.</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-green-700 hover:bg-green-600 px-5 py-2 rounded-lg font-bold"
          >
            Recargar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
