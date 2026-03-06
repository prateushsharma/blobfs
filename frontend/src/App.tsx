import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Landing from './pages/Landing'
import Marketplace from './pages/Marketplace'
import Dataset from './pages/Dataset'
import Publish from './pages/Publish'
import Verify from './pages/Verify'
import Dashboard from './pages/Dashboard'

export default function App() {
  return (
    <div className="scanlines min-h-screen bg-bg">
      <Navbar />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/marketplace" element={<Marketplace />} />
        <Route path="/dataset/:id" element={<Dataset />} />
        <Route path="/publish" element={<Publish />} />
        <Route path="/verify/:hash" element={<Verify />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </div>
  )
}