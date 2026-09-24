import React, { useState, useEffect } from 'react';
import PreFlightDashboard from './pages/PreFlightDashboard';
import SessionSummary from './pages/SessionSummary';
import OverlayHUD from './components/OverlayHUD';

export default function App() {
  // Determine if window was opened specifically as the overlay window
  const isOverlayWindow = window.location.hash === '#overlay';

  const [currentView, setCurrentView] = useState(isOverlayWindow ? 'overlay' : 'dashboard');
  const [activeSessionConfig, setActiveSessionConfig] = useState(null);
  const [sessionSummaryData, setSessionSummaryData] = useState(null);

  // Listen to Electron session:ended events
  useEffect(() => {
    if (window.electronAPI?.onSessionEnded) {
      const unsub = window.electronAPI.onSessionEnded((summary) => {
        setSessionSummaryData(summary);
        setCurrentView('summary');
      });
      return () => {
        if (typeof unsub === 'function') unsub();
      };
    }
  }, []);

  const handleLaunchSession = (config) => {
    setActiveSessionConfig(config);
    if (window.electronAPI?.startSession) {
      window.electronAPI.startSession(config);
    } else {
      // In browser fallback, transition view directly
      setCurrentView('overlay');
    }
  };

  const handleEndSession = (summary) => {
    setSessionSummaryData(summary);
    setCurrentView('summary');
  };

  const handleStartNewSession = () => {
    setSessionSummaryData(null);
    setCurrentView('dashboard');
  };

  if (isOverlayWindow || currentView === 'overlay') {
    return (
      <div className="w-screen h-screen overflow-hidden bg-transparent select-none">
        <OverlayHUD
          sessionConfig={activeSessionConfig}
          onEndSessionProp={handleEndSession}
        />
      </div>
    );
  }

  if (currentView === 'summary') {
    return (
      <SessionSummary
        sessionData={sessionSummaryData || activeSessionConfig}
        onStartNewSession={handleStartNewSession}
      />
    );
  }

  return (
    <PreFlightDashboard
      onLaunchSession={handleLaunchSession}
    />
  );
}
