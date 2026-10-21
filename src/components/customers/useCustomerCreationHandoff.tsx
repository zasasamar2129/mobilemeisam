import React, { useCallback, useRef, useState } from 'react';
import { Customer } from '../../types';
import { CustomerFormModal } from './CustomerFormModal';

/**
 * Sentinel value used as a `<Select>` option for "create a new customer".
 * Consumers add it to their own option list and call `open()` in `onChange`.
 */
export const CUSTOMER_CREATE_VALUE = '__create_new_customer__';

export const CUSTOMER_CREATE_LABEL = '＋ معرفی مشتری جدید';

/**
 * Handoff between an in-progress form (SIM reservation, sale, mortgage,
 * payment, check, ...) and the customer-creation modal.
 *
 * The originating form stays mounted underneath the modal, so every field the
 * user already typed survives opening, cancelling, failing, and coming back —
 * nothing is written to the URL or to persistent browser storage. Cancelling
 * leaves the selection untouched; a successful save selects the new customer
 * without submitting the originating form.
 */
export function useCustomerCreationHandoff() {
  const [isOpen, setIsOpen] = useState(false);
  const onCreatedRef = useRef<((customer: Customer) => void) | null>(null);

  const open = useCallback((onCreated?: (customer: Customer) => void) => {
    onCreatedRef.current = onCreated || null;
    setIsOpen(true);
  }, []);

  const handleCreated = useCallback((customer: Customer) => {
    setIsOpen(false);
    // Selection only — the caller's form is never submitted from here.
    onCreatedRef.current?.(customer);
    onCreatedRef.current = null;
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    // Cancel: drop the callback so a later stray save cannot fire it. The
    // originating form keeps its draft and its previous selection.
    onCreatedRef.current = null;
  }, []);

  const modal = (
    <CustomerFormModal isOpen={isOpen} onClose={handleClose} onSaved={handleCreated} />
  );

  return { isOpen, open, close: handleClose, modal };
}

/** Option entry to append to any customer `<Select>` option list. */
export const customerCreateOption = () => ({
  value: CUSTOMER_CREATE_VALUE,
  label: CUSTOMER_CREATE_LABEL,
});
