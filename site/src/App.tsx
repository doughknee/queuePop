import { Nav } from './components/Nav'
import { Hero } from './components/Hero'
import { Marquee } from './components/Marquee'
import { FeatureGrid } from './components/FeatureGrid'
import { HowItWorks } from './components/HowItWorks'
import { DeepDives } from './components/DeepDives'
import { Gallery } from './components/Gallery'
import { Privacy } from './components/Privacy'
import { Origin } from './components/Origin'
import { Faq } from './components/Faq'
import { Donate } from './components/Donate'
import { Footer } from './components/Footer'

export function App() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Marquee />
        <FeatureGrid />
        <HowItWorks />
        <DeepDives />
        <Gallery />
        <Privacy />
        <Origin />
        <Faq />
        <Donate />
      </main>
      <Footer />
    </>
  )
}
