/**
 * ErrorBoundary.jsx - Shows a recovery screen instead of a blank page when a
 * component crashes.
 */

import { Component } from 'react'
import ErrorScreen from './ErrorScreen'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorScreen
          title="Something went wrong"
          message="An unexpected error occurred. Try reloading the page or going back to the dashboard."
          error={this.state.error}
        />
      )
    }

    return this.props.children
  }
}
