/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Customer {
  id: string;
  fullName: string;
  phoneNumber: string;
  createdAt: string;
  updatedAt: string;
}

export interface Contract {
  id: string;
  customerId: string;
  contractNumber: string;
  simNumber: string;
  contractDate: string;
  endDate: string;
  totalPrice: number;
  prepayment: number;
  remainingBalance: number;
  monthlyInstallment: number;
  monthsCount: number;
  status: 'active' | 'finished' | 'terminated';
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Installment {
  id: string;
  contractId: string;
  installmentNumber: number;
  dueDate: string; /* YYYY-MM-DD */
  amount: number;
  status: 'pending' | 'paid' | 'overdue';
  paidDate: string | null; /* YYYY-MM-DD */
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  contractId: string;
  amount: number;
  paymentDate: string; /* YYYY-MM-DD */
  receiptImage: string | null; /* Base64 or standard reference */
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityLog {
  id: string;
  type: 'contract_created' | 'payment_received' | 'contract_status' | 'customer_created' | 'contract_deleted';
  titleFa: string;
  titleEn: string;
  detailsFa: string;
  detailsEn: string;
  timestamp: string;
}

export interface NotificationItem {
  id: string;
  type: 'overdue' | 'ending_soon' | 'paid_recent';
  messageFa: string;
  messageEn: string;
  date: string;
  isRead: boolean;
}

export type Language = 'fa' | 'en';
