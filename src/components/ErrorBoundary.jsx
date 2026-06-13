import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <div className="text-4xl">&#x1F635;</div>
          <h2 className="text-xl font-semibold">页面出现错误</h2>
          <p className="text-dark-400 text-sm">{this.state.error?.message}</p>
          <button onClick={() => window.location.reload()} className="btn-primary">刷新页面</button>
        </div>
      )
    }
    return this.props.children
  }
}
