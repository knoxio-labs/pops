import { useEffect, useState } from 'react';

function currentOnlineState(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

/** Reads navigator.onLine and follows the window online and offline events. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(currentOnlineState);

  useEffect(() => {
    const setOnlineState = (): void => setOnline(true);
    const setOfflineState = (): void => setOnline(false);
    window.addEventListener('online', setOnlineState);
    window.addEventListener('offline', setOfflineState);
    return () => {
      window.removeEventListener('online', setOnlineState);
      window.removeEventListener('offline', setOfflineState);
    };
  }, []);

  return online;
}
