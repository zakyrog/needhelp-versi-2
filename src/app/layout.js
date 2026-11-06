import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource-variable/plus-jakarta-sans/wght.css";
import "@fontsource-variable/fraunces/wght.css";
import "../styles/tokens.css";
import "../styles/base.css";
import "../styles/ux-states.css";
import "../styles/theme.css";

import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { ToastProvider } from "../components/Toast";
import { BodyClassManager } from "../components/BodyClassManager";

export const metadata = {
  metadataBase: new URL("https://needhelpjogja.my.id"),
  title: {
    default: "NeedHelp - Platform Bantuan dan Teman Situasional",
    template: "%s - NeedHelp",
  },
  description:
    "NeedHelp adalah platform digital untuk menemukan bantuan dan teman situasional di Kota Yogyakarta.",
  openGraph: {
    title: "NeedHelp - Platform Bantuan dan Teman Situasional",
    description:
      "Temukan orang di sekitar yang bisa membantu atau tawarkan bantuanmu di Yogyakarta.",
    images: ["/assets/images/logo.svg"],
    type: "website",
    locale: "id_ID",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>
        <BodyClassManager />
        <ToastProvider>
          <Header />
          {children}
          <Footer />
        </ToastProvider>
      </body>
    </html>
  );
}
