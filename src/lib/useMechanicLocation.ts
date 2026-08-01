import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Sends the mechanic's GPS position to the database every 10 seconds
 * and on significant movement. Only active for users with role 'mecanico'.
 *
 * Uses the Screen Wake Lock API to keep the device awake while the app is
 * open (so the phone doesn't sleep in a pocket), and the Page Visibility API
 * to immediately re-acquire location when the user returns to the app.
 */
export function useMechanicLocation(userId: string | undefined, companyId: string | undefined, role: string | null) {
  const watchId = useRef<number | null>(null);
  const lastSent = useRef(0);
  const wakeLockRef = useRef<any>(null);

  useEffect(() => {
    if (!userId || !companyId || role !== 'mecanico') return;
    if (!('geolocation' in navigator)) return;

    const sendLocation = async (lat: number, lng: number, accuracy?: number, heading?: number, speed?: number) => {
      const now = Date.now();
      if (now - lastSent.current < 5_000) return;
      lastSent.current = now;

      const { data: mech } = await supabase.from('mechanics')
        .select('id').eq('company_id', companyId).eq('user_id', userId).maybeSingle();

      await supabase.from('mechanic_locations').upsert({
        user_id: userId,
        company_id: companyId,
        mechanic_id: mech?.id ?? null,
        latitude: lat,
        longitude: lng,
        accuracy_meters: accuracy ?? null,
        heading: heading ?? null,
        speed: speed ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,company_id' });
    };

    const onSuccess = (pos: GeolocationPosition) => {
      sendLocation(
        pos.coords.latitude,
        pos.coords.longitude,
        pos.coords.accuracy,
        pos.coords.heading ?? undefined,
        pos.coords.speed ?? undefined,
      );
    };

    const startWatch = () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
      navigator.geolocation.getCurrentPosition(onSuccess, () => {}, {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 15_000,
      });
      watchId.current = navigator.geolocation.watchPosition(onSuccess, () => {}, {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 8_000,
      });
    };

    startWatch();

    // Poll every 8 seconds as a fallback for always-fresh location
    const interval = setInterval(() => {
      navigator.geolocation.getCurrentPosition(onSuccess, () => {}, {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 10_000,
      });
    }, 8_000);

    // Re-acquire location immediately when the page becomes visible again
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        lastSent.current = 0;
        navigator.geolocation.getCurrentPosition(onSuccess, () => {}, {
          enableHighAccuracy: true,
          timeout: 10_000,
          maximumAge: 0,
        });
        startWatch();
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Screen Wake Lock — keeps the device awake so GPS tracking continues
    // even when the phone is in a pocket with the screen on.
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        }
      } catch {
        // wake lock not available or denied — tracking continues without it
      }
    };
    requestWakeLock();

    // Re-acquire wake lock if it gets released (e.g. screen turns off)
    const onWakeLockRelease = () => {
      if (wakeLockRef.current && wakeLockRef.current.released) {
        requestWakeLock();
      }
    };
    if (wakeLockRef.current) {
      wakeLockRef.current.addEventListener?.('release', onWakeLockRelease);
    }

    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      wakeLockRef.current?.release?.().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [userId, companyId, role]);
}
