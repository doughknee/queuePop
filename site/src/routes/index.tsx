import { createFileRoute } from '@tanstack/react-router'
import { Nav } from '../components/Nav'
import { Hero } from '../components/Hero'
import { Marquee } from '../components/Marquee'
import { FeatureGrid } from '../components/FeatureGrid'
import { HowItWorks } from '../components/HowItWorks'
import { DeepDives } from '../components/DeepDives'
import { Gallery } from '../components/Gallery'
import { Faq } from '../components/Faq'
import { Donate } from '../components/Donate'
import { Footer } from '../components/Footer'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
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
        <Faq />
        <Donate />
      </main>
      <Footer />
    </>
  )
}
