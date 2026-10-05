import { Command, CommandHandler } from './types';
import { SlotReservationService } from '../services/SlotReservationService';

export class LockSlotCommand implements Command {
  readonly name = 'LockSlotCommand';
  constructor(
    public readonly therapistId: string,
    public readonly date: string,
    public readonly time: string,
    public readonly userId: string,
    public readonly customLockId?: string
  ) {}
}

export interface LockSlotResult {
  success: boolean;
  lockId?: string;
  error?: string;
}

export class LockSlotCommandHandler implements CommandHandler<LockSlotCommand, LockSlotResult> {
  async execute(command: LockSlotCommand): Promise<LockSlotResult> {
    const { therapistId, date, time, userId, customLockId } = command;
    return SlotReservationService.acquireLock(therapistId, date, time, userId, 10, customLockId);
  }
}
