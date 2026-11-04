import { useEffect, useState } from 'react';

export default function useDelayedLoading(loading: boolean, delayMs = 200) {
  const [delayedLoading, setDelayedLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDelayedLoading(loading), loading ? delayMs : 0);
    return () => clearTimeout(timer);
  }, [delayMs, loading]);

  return loading && delayedLoading;
}
