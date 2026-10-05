import {
  collection,
  getDocs,
  query,
  where
} from 'firebase/firestore';
import { db } from '../lib/firebase/client';
import { Therapist, TherapistAvailabilityRule, TherapistOverride } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { mapTherapist } from '../utils/mappers';
import { fetchWithAuth } from '@/lib/fetchWithAuth';

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
      return mapTherapist(d.id, d.data());
    } catch (err: unknown) {
      handleFirestoreError(err, OperationType.LIST, 'therapists');
      return null;
    }
  },

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

  getAvailabilityRules: async (
    therapistId: string
  ): Promise<TherapistAvailabilityRule[]> => {
    try {
      const ref = collection(db, `therapistAvailability/${therapistId}/recurringRules`);
      const snapshot = await getDocs(ref);

      return snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<TherapistAvailabilityRule, 'id'>)
      }));
    } catch (err: unknown) {
      handleFirestoreError(err, OperationType.LIST, `therapistAvailability/${therapistId}/recurringRules`);
      return [];
    }
  },

  saveAvailabilityRule: async (
    therapistId: string,
    rule: Omit<TherapistAvailabilityRule, 'id'>
  ) => {
    try {
      const response = await fetchWithAuth('/api/therapist/availability/rule', {
        method: 'POST',
        body: JSON.stringify({ therapistId, rule })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'API Request Failed');
      }
      return data;
    } catch (err: unknown) {
      handleFirestoreError(err, OperationType.CREATE, `therapistAvailability/${therapistId}/recurringRules`);
      throw err;
    }
  },

  deleteAvailabilityRule: async (therapistId: string, ruleId: string) => {
    try {
      const response = await fetchWithAuth(`/api/therapist/availability/rule?therapistId=${therapistId}&ruleId=${ruleId}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'API Request Failed');
      }
      return data;
    } catch (err: unknown) {
      handleFirestoreError(err, OperationType.DELETE, `therapistAvailability/${therapistId}/recurringRules/${ruleId}`);
      throw err;
    }
  },

  getOverrides: async (therapistId: string): Promise<TherapistOverride[]> => {
    try {
      const ref = collection(db, `therapistAvailability/${therapistId}/overrides`);
      const snapshot = await getDocs(ref);

      return snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<TherapistOverride, 'id'>)
      }));
    } catch (err: unknown) {
      handleFirestoreError(err, OperationType.LIST, `therapistAvailability/${therapistId}/overrides`);
      return [];
    }
  },

  saveOverride: async (therapistId: string, override: Omit<TherapistOverride, 'id'>) => {
    try {
      const response = await fetchWithAuth('/api/therapist/availability/override', {
        method: 'POST',
        body: JSON.stringify({ therapistId, override })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'API Request Failed');
      }
      return data;
    } catch (err: unknown) {
      handleFirestoreError(err, OperationType.CREATE, `therapistAvailability/${therapistId}/overrides`);
      throw err;
    }
  },

  deleteOverride: async (therapistId: string, overrideId: string) => {
    try {
      const response = await fetchWithAuth(`/api/therapist/availability/override?therapistId=${therapistId}&overrideId=${overrideId}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'API Request Failed');
      }
      return data;
    } catch (err: unknown) {
      handleFirestoreError(err, OperationType.DELETE, `therapistAvailability/${therapistId}/overrides/${overrideId}`);
      throw err;
    }
  },

  updateTherapistStatus: async (therapistId: string, active: boolean) => {
    try {
      const response = await fetchWithAuth('/api/therapist/status', {
        method: 'POST',
        body: JSON.stringify({ therapistId, active })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'API Request Failed');
      }
      return data;
    } catch (err: unknown) {
      handleFirestoreError(err, OperationType.UPDATE, `therapists/${therapistId}`);
      throw err;
    }
  }
};
