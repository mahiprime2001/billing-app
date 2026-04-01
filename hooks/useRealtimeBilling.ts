import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase-browser";

type ChangeEvent = "INSERT" | "UPDATE" | "DELETE";

interface UseRealtimeBillingProps {
  onBillChange: (event: ChangeEvent, row: any) => void;
  onProductChange: (event: ChangeEvent, row: any) => void;
  onCustomerChange: (event: ChangeEvent, row: any) => void;
  storeId?: string | null;
}

export function useRealtimeBilling({
  onBillChange,
  onProductChange,
  onCustomerChange,
  storeId,
}: UseRealtimeBillingProps) {
  const callbacksRef = useRef({ onBillChange, onProductChange, onCustomerChange });

  // Keep callbacks fresh without re-subscribing
  useEffect(() => {
    callbacksRef.current = { onBillChange, onProductChange, onCustomerChange };
  });

  useEffect(() => {
    const channel = supabase
      .channel("billing-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bills",
          ...(storeId ? { filter: `storeid=eq.${storeId}` } : {}),
        },
        (payload) => {
          const row = payload.new && Object.keys(payload.new).length > 0
            ? payload.new
            : payload.old;
          callbacksRef.current.onBillChange(payload.eventType as ChangeEvent, row);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        (payload) => {
          const row = payload.new && Object.keys(payload.new).length > 0
            ? payload.new
            : payload.old;
          callbacksRef.current.onProductChange(payload.eventType as ChangeEvent, row);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customers" },
        (payload) => {
          const row = payload.new && Object.keys(payload.new).length > 0
            ? payload.new
            : payload.old;
          callbacksRef.current.onCustomerChange(payload.eventType as ChangeEvent, row);
        }
      )
      .subscribe((status) => {
        console.log("Realtime subscription status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [storeId]); // only re-subscribe if storeId changes
}
