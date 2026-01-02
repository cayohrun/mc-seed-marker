import './globals.css'

export const metadata = {
  title: 'MC Seed Marker',
  description: 'Minecraft Seed Map with custom markers',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  )
}
