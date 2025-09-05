"use client";

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const IdleTimeoutHandler = ({ timeoutInMinutes = 120 }) => {
  const router = useRouter();
  let timeoutId: NodeJS.Timeout;

  const handleLogout = useCallback(() => {
    window.location.href = '/'; // Redirect to the main page
  }, []);

  const resetTimeout = useCallback(() => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(handleLogout, timeoutInMinutes * 60 * 1000);
  }, [handleLogout, timeoutInMinutes]);

  useEffect(() => {
    const events = ['mousemove', 'keydown', 'click', 'scroll'];

    const reset = () => resetTimeout();

    events.forEach(event => window.addEventListener(event, reset));
    resetTimeout();

    return () => {
      clearTimeout(timeoutId);
      events.forEach(event => window.removeEventListener(event, reset));
    };
  }, [resetTimeout]);

  return null;
};

export default IdleTimeoutHandler;
