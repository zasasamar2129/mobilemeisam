/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Customer } from '../types.ts';
import { getTranslation } from '../translations.ts';
import { Users, Plus, Search, Edit2, Check, X, Phone, UserPlus } from 'lucide-react';

interface CustomerManagementProps {
  customers: Customer[];
  onAddCustomer: (fullName: string, phoneNumber: string) => Promise<any>;
  onEditCustomer: (id: string, fullName: string, phoneNumber: string) => Promise<any>;
  lang: 'fa' | 'en';
}

export default function CustomerManagement({ 
  customers, 
  onAddCustomer, 
  onEditCustomer, 
  lang 
}: CustomerManagementProps) {
  const t = getTranslation(lang);
  const [search, setSearch] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [editFullName, setEditFullName] = useState('');
  const [editPhoneNumber, setEditPhoneNumber] = useState('');

  const [errorMsg, setErrorMsg] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!fullName.trim() || !phoneNumber.trim()) return;

    try {
      await onAddCustomer(fullName, phoneNumber);
      setFullName('');
      setPhoneNumber('');
      setIsAdding(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error occurred');
    }
  };

  const handleEditInit = (c: Customer) => {
    setEditingId(c.id);
    setEditFullName(c.fullName);
    setEditPhoneNumber(c.phoneNumber);
  };

  const handleUpdate = async (id: string) => {
    setErrorMsg('');
    if (!editFullName.trim() || !editPhoneNumber.trim()) return;

    try {
      await onEditCustomer(id, editFullName, editPhoneNumber);
      setEditingId(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error occurred');
    }
  };

  const filtered = customers.filter(
    c => c.fullName.toLowerCase().includes(search.toLowerCase()) || 
         c.phoneNumber.includes(search)
  );

  return (
    <div className="space-y-6">
      
      {/* Top action header and Search box */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 rounded-xl glass-card">
        
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 ${lang === 'fa' ? 'right-3' : 'left-3'}`} />
          <input
            type="text"
            placeholder={lang === 'fa' ? 'جستجوی مشتری بر اساس نام/تلفن...' : 'Search customers by name/phone...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`w-full py-2 bg-black border border-gold/20 rounded-lg text-sm text-white ${lang === 'fa' ? 'pr-10' : 'pl-10'}`}
          />
        </div>

        {/* Add client button */}
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="px-4 py-2 mt-2 sm:mt-0 bg-gold text-black rounded-lg hover:bg-gold-hover transition-all text-sm font-display font-semibold flex items-center justify-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          {t.addNewCustomer}
        </button>
      </div>

      {/* Slide-in Add Customer Panel */}
      {isAdding && (
        <form onSubmit={handleCreate} className="p-6 rounded-xl glass-card border-gold/40 space-y-4 max-w-xl animate-gold-glow">
          <h3 className="text-base font-bold text-gold flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-gold" />
            {t.addNewCustomer}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-gray-400 block">{t.fullName}</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={lang === 'fa' ? 'مثال: رضا احمدی' : 'e.g. John Doe'}
                required
                className="w-full text-sm p-2"
              />
            </div>
            
            <div className="space-y-1">
              <label className="text-xs text-gray-400 block">{t.phoneNumber}</label>
              <input
                type="text"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="0912XXXXXXXX"
                required
                className="w-full text-sm p-3 font-mono"
              />
            </div>
          </div>

          {errorMsg && (
            <p className="text-xs text-rose-400 bg-rose-950/20 p-2 rounded-lg border border-rose-500/10">
              {errorMsg}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 text-xs bg-turquoise text-black font-semibold rounded-lg hover:bg-turquoise-hover cursor-pointer"
            >
              {t.save}
            </button>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-4 py-2 text-xs bg-gray-800 text-white rounded-lg hover:bg-gray-700 cursor-pointer"
            >
              {t.cancel}
            </button>
          </div>
        </form>
      )}

      {/* Directory Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-800 bg-black/40">
        <table className="w-full text-sm text-center text-gray-300">
          <thead className="text-xs text-gray-400 bg-gray-900 bg-opacity-70 uppercase border-b border-gray-800">
            <tr>
              <th className="py-3 px-4">{t.id}</th>
              <th className="py-3 px-4">{t.fullName}</th>
              <th className="py-3 px-4">{t.phoneNumber}</th>
              <th className="py-3 px-4">{t.createdAt}</th>
              <th className="py-3 px-4">{t.actions}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/60 font-sans">
            {filtered.map(c => {
              const isEditing = editingId === c.id;
              return (
                <tr key={c.id} className="hover:bg-gray-900/30 transition-colors">
                  <td className="py-3 px-4 text-xs font-mono text-gray-500">{c.id}</td>
                  
                  <td className="py-3 px-4">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editFullName}
                        onChange={(e) => setEditFullName(e.target.value)}
                        className="p-1 text-sm text-center font-bold bg-black max-w-[200px]"
                      />
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gold/15 border border-gold/30 text-gold flex items-center justify-center text-[10px] uppercase font-bold">
                          {c.fullName.substring(0,2)}
                        </div>
                        <span className="font-bold text-gray-100">{c.fullName}</span>
                      </div>
                    )}
                  </td>

                  <td className="py-3 px-4 font-mono">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editPhoneNumber}
                        onChange={(e) => setEditPhoneNumber(e.target.value)}
                        className="p-1 text-sm text-center bg-black font-semibold font-mono text-turquoise max-w-[150px]"
                      />
                    ) : (
                      <div className="inline-flex items-center gap-1 text-turquoise">
                        <Phone className="w-3.5 h-3.5 opacity-60" />
                        <span className="font-bold tracking-widest">{c.phoneNumber}</span>
                      </div>
                    )}
                  </td>

                  <td className="py-3 px-4 text-xs font-mono text-gray-400">
                    {c.createdAt.substring(0, 10)}
                  </td>

                  <td className="py-3 px-4">
                    {isEditing ? (
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => handleUpdate(c.id)}
                          className="p-1 rounded bg-turquoise/20 text-turquoise hover:bg-turquoise hover:text-black transition-colors cursor-pointer"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-1 rounded bg-gray-800 text-white hover:bg-gray-700 transition-colors cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleEditInit(c)}
                        className="px-3 py-1 bg-black text-xs font-semibold text-gold border border-gold/20 hover:border-gold rounded-md transition-all flex items-center justify-center gap-1 mx-auto cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        {t.edit}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-gray-500 font-medium">
                  {lang === 'fa' ? 'هیچ کاربری با این مشخصات یافت نشد.' : 'No users match the search criterion.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
