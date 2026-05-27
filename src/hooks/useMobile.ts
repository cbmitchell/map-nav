import { useState, useEffect } from 'react';

const MOBILE_Q = '(max-width: 640px)';
const TABLET_Q = '(max-width: 1024px)';

export function useMobile() {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_Q).matches);
  const [isTablet, setIsTablet] = useState(
    () => window.matchMedia(TABLET_Q).matches && !window.matchMedia(MOBILE_Q).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_Q);
    const tql = window.matchMedia(TABLET_Q);

    const update = () => {
      const mobile = mql.matches;
      const tablet = tql.matches && !mobile;
      setIsMobile(mobile);
      setIsTablet(tablet);
    };

    mql.addEventListener('change', update);
    tql.addEventListener('change', update);
    return () => {
      mql.removeEventListener('change', update);
      tql.removeEventListener('change', update);
    };
  }, []);

  return { isMobile, isTablet };
}
