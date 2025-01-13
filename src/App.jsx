import React, { useState } from 'react'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import MainContent from './components/MainContent'
import SettingsModal from './components/SettingsModal'

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  
  return (
    <div className="app">
      <Header onSettingsClick={() => setIsSettingsOpen(true)} />
      <div className="main-container">
        <Sidebar />
        <MainContent />
      </div>
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />
    </div>
  )
}

export default App