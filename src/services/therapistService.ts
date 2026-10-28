import {
  collection,
  getDocs,
  query,
  where
} from 'firebase/firestore';
import { db } from '../lib/firebase/firestore';
import { Therapist } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { mapTherapist } from '../utils/mappers';

export const therapistService = {
  getTherapists: async (includeInactive: boolean = false): Promise<Therapist[]> => {
    try {
      const ref = collection(db, 'therapists');
      let q = query(ref);
      if (!includeInactive) {
        q = query(ref, where('active', '==', true));
      }
      const snapshot = await getDocs(q);

      return snapshot.docs.map((d) => mapTherapist(d.id, d.data()));
    } catch (err: unknown) {
      handleFirestoreError(err, OperationType.LIST, 'therapists');
      return [];
    }
  },
};