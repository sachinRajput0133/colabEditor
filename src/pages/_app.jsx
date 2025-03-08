// import "@/styles/globals.css";

// export default function App({ Component, pageProps }) {
//   return <Component {...pageProps} />;
// }
import { SessionProvider } from 'next-auth/react';
import { Suspense, lazy } from 'react';
import '../styles/globals.css';
// import Layout from '@components/layout/Layout'
// Use React.lazy for Layout component to optimize performance
const Layout = lazy(() => import('@components/layout/Layout'));

function MyApp({ Component, pageProps: { session, ...pageProps } }) {
  return (
    <SessionProvider session={session}>
      <Suspense fallback={<div className="flex h-screen items-center justify-center">Loading...</div>}>
        <Layout>
          <Component {...pageProps} />
        </Layout>
      </Suspense>
    </SessionProvider>
  );
}

export default MyApp;