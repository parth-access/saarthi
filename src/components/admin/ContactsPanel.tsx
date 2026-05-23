import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs, updateDoc, doc, deleteDoc, startAfter } from 'firebase/firestore';
import { db } from '../../lib/firebase/client';
import { format } from 'date-fns';
import { Button } from '../ui/Button';
import { CheckCircle2, Search, ShieldAlert, Trash2, MailOpen, User } from 'lucide-react';

import { toDateSafe, cn } from '../../lib/utils';

interface Contact {
  id: string;
  name: string;
  email: string;
  message: string;
  status: 'unread' | 'in-progress' | 'resolved' | 'spam';
  priority: 'normal' | 'high';
  createdAt: unknown;
  source: string;
}

export function ContactsPanel() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState<unknown>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unread' | 'resolved' | 'spam'>('all');

  const fetchContacts = async (isNextPage = false) => {
    try {
      setLoading(true);
      let q = query(
        collection(db, 'contacts'),
        orderBy('createdAt', 'desc'),
        limit(20)
      );

      if (isNextPage && lastDoc) {
        q = query(q, startAfter(lastDoc));
      }

      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Contact[];

      setLastDoc(snapshot.docs[snapshot.docs.length - 1]);

      if (isNextPage) {
        setContacts(prev => [...prev, ...data]);
      } else {
        setContacts(data);
      }
    } catch (error) {
      console.error("Failed to fetch contacts", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateStatus = async (id: string, status: Contact['status']) => {
    try {
      await updateDoc(doc(db, 'contacts', id), { status });
      setContacts(prev => prev.map(c => c.id === id ? { ...c, status } : c));
    } catch (error) {
      console.error("Update failed", error);
    }
  };

  const deleteContact = async (id: string) => {
    if (!window.confirm("Delete this inquiry entirely?")) return;
    try {
      await deleteDoc(doc(db, 'contacts', id));
      setContacts(prev => prev.filter(c => c.id !== id));
    } catch (error) {
      console.error("Delete failed", error);
    }
  };

  const filteredContacts = contacts.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return c.name?.toLowerCase().includes(term) || 
             c.email?.toLowerCase().includes(term) || 
             c.message?.toLowerCase().includes(term);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <h2 className="text-3xl font-serif tracking-tight">Inquiries</h2>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/30" />
            <input 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search inquiries..." 
              className="w-full h-12 pl-11 pr-4 rounded-2xl bg-white border border-primary/10 focus:ring-4 focus:ring-primary/5 transition-all text-sm outline-none"
            />
          </div>
          <select 
            className="h-12 px-4 pr-10 rounded-2xl bg-white border border-primary/10 text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-primary/5 outline-none cursor-pointer"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'unread' | 'resolved' | 'spam')}
          >
            <option value="all">All</option>
            <option value="unread">Unread</option>
            <option value="resolved">Resolved</option>
            <option value="spam">Spam</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-primary/5 overflow-hidden shadow-sm">
        {loading && contacts.length === 0 ? (
          <div className="p-16 text-center text-primary/40 font-medium text-sm bg-[#FAFAFA]">Loading inquiries...</div>
        ) : filteredContacts.length === 0 ? (
          <div className="p-16 text-center text-primary/40 font-medium text-sm bg-[#FAFAFA]">🌿 All caught up. No inquiries found.</div>
        ) : (
          <div className="divide-y divide-primary/5">
            {filteredContacts.map(contact => (
              <div key={contact.id} className={cn("p-6 sm:p-8 transition-colors", contact.status === 'unread' ? "bg-primary/5" : "")}>
                <div className="flex flex-col xl:flex-row gap-6 justify-between items-start">
                  
                  <div className="flex-1 space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-lg flex items-center gap-2">
                          {contact.name}
                          {contact.status === 'unread' && (
                            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                          )}
                        </h3>
                        <a href={`mailto:${contact.email}`} className="text-sm text-primary/60 hover:text-primary transition-colors flex items-center gap-1 mt-1">
                          <User className="w-3.5 h-3.5" /> {contact.email}
                        </a>
                        <div className="text-xs text-muted-foreground mt-1">
                          {contact.createdAt ? format(toDateSafe(contact.createdAt) || new Date(), "MMM d, yyyy 'at' h:mm a") : 'Unknown Date'}
                        </div>
                      </div>
                    </div>

                    <div className="bg-[#FCFAF7] p-4 rounded-2xl text-sm leading-relaxed border border-primary/5 whitespace-pre-wrap">
                      {contact.message}
                    </div>
                  </div>

                  <div className="flex flex-wrap xl:flex-col gap-2 shrink-0">
                    {contact.status === 'unread' ? (
                      <Button onClick={() => updateStatus(contact.id, 'resolved')} variant="outline" size="sm" className="justify-start gap-2 h-10 rounded-xl border-green-200 text-green-700 hover:bg-green-50 w-32 shadow-sm hover:shadow-md transition-all">
                        <CheckCircle2 className="w-4 h-4" /> Resolve
                      </Button>
                    ) : (
                      <Button onClick={() => updateStatus(contact.id, 'unread')} variant="outline" size="sm" className="justify-start gap-2 h-10 rounded-xl w-32 shadow-sm hover:shadow-md transition-all">
                        <MailOpen className="w-4 h-4" /> Mark Unread
                      </Button>
                    )}
                    
                    {contact.status !== 'spam' && (
                      <Button onClick={() => updateStatus(contact.id, 'spam')} variant="outline" size="sm" className="justify-start gap-2 h-10 rounded-xl border-[#E6A520]/20 text-amber-700 hover:bg-[#E6A520]/5 w-32 shadow-sm hover:shadow-md transition-all">
                        <ShieldAlert className="w-4 h-4" /> Mark Spam
                      </Button>
                    )}
                    
                    <Button onClick={() => deleteContact(contact.id)} variant="outline" size="sm" className="justify-start gap-2 h-10 rounded-xl border-red-200 text-red-700 hover:bg-red-50 w-32 shadow-sm hover:shadow-md transition-all">
                        <Trash2 className="w-4 h-4" /> Delete
                    </Button>
                  </div>

                </div>
              </div>
            ))}
          </div>
        )}
        
        {!!lastDoc && filteredContacts.length >= 20 && (
          <div className="p-4 border-t border-primary/5 flex justify-center">
            <Button variant="outline" onClick={() => fetchContacts(true)} disabled={loading}>
              {loading ? 'Loading...' : 'Load More'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
