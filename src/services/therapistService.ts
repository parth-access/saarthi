import {
  collection,
  getDocs,
  doc,
  addDoc,
  deleteDoc,
  query,
  where
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Therapist, AvailabilityConfig } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';

export const therapistService = {
  getTherapistByAuthId: async (authId: string): Promise<Therapist | null> => {
    try {
      const ref = collection(db, 'therapists');
      const q = query(ref, where('authId', '==', authId));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        return null;
      }

      const d = snapshot.docs[0];
      return {
        id: d.id,
        ...(d.data() as Omit<Therapist, 'id'>)
      };
    } catch (err: any) {
      handleFirestoreError(err, OperationType.LIST, 'therapists');
      return null;
    }
  },

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

  getAvailabilityRules: async (
    therapistId: string
  ): Promise<AvailabilityConfig[]> => {
    try {
      const ref = collection(db, 'availability_rules');
      const q = query(ref, where('therapistId', '==', therapistId));
      const snapshot = await getDocs(q);

      return snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<AvailabilityConfig, 'id'>)
      }));
    } catch (err: any) {
      handleFirestoreError(err, OperationType.LIST, 'availability_rules');
      return [];
    }
  },

  addAvailabilityRule: async (
    rule: Omit<AvailabilityConfig, 'id'>
  ) => {
    try {
      const ref = collection(db, 'availability_rules');
      const docRef = await addDoc(ref, rule);
      return { success: true, id: docRef.id };
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, 'availability_rules');
      throw err;
    }
  },

  deleteAvailabilityRule: async (id: string) => {
    try {
      const ref = doc(db, 'availability_rules', id);
      await deleteDoc(ref);
      return { success: true };
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `availability_rules/${id}`);
      throw err;
    }
  }
};