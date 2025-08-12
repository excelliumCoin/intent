export const metadata = { title: "Intent Demo" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{
        fontFamily: 'ui-sans-serif, system-ui',
        margin: 0,
        background: '#0b1020',
        color: '#e7ecff'
      }}>
        <div style={{ maxWidth: 900, margin: '24px auto', padding: 16 }}>
          <h1 style={{ margin: 0, fontSize: 28 }}>Anoma Intent Demo</h1>
          <p style={{ opacity: .8, marginTop: 6 }}>Post signed intents, then match with the solver.</p>
          {children}
        </div>
      </body>
    </html>
  );
}