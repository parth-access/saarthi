import {
  collection,
  getDocs,
  doc,
  setDoc,
  getDoc,
  query,
  where
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Therapist } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';

export const therapistService = {
  getTherapists: async (): Promise<Therapist[]> => {
    try {
      const ref = collection(db, 'therapists');
      const q = query(ref, where('active', '==', true));
      const snapshot = await getDocs(q);

      return snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Therapist, 'id'>)
      }));
    } catch (err: any) {
      handleFirestoreError(err, OperationType.LIST, 'therapists');
      return [];
    }
  },

  getAvailability: async (
    therapistId: string
  ): Promise<Record<string, string[]>> => {
    try {
      const ref = doc(db, 'availability_rules', therapistId);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        return snap.data() as Record<string, string[]>;
      }

      return {};
    } catch (err: any) {
      handleFirestoreError(err, OperationType.GET, 'availability_rules');
      return {};
    }
  },

  updateAvailability: async (
    date: string,
    slots: string[],
    therapistId: string
  ) => {
    try {
      const ref = doc(db, 'availability_rules', therapistId);
      await setDoc(ref, { [date]: slots }, { merge: true });

      return { success: true };
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, 'availability_rules');
      throw err;
    }
  },

  deleteAvailability: async (date: string, therapistId: string) => {
    try {
      const ref = doc(db, 'availability_rules', therapistId);
      const snap = await getDoc(ref);

      if (snap.exists()) {
        const data = snap.data() as Record<string, string[]>;
        delete data[date];
        await setDoc(ref, data);
      }

      return { success: true };
    } catch (err: any) {
      throw err;
    }
  }
};