import { describe, it, expect } from 'vitest';
import { CAN_CREATE_BRANDS, CAN_RUN_RESEARCH, ROLES } from './roles';

describe('role constants', () => {
  it('includes all expected roles', () => {
    expect(ROLES.OWNER).toBe('OWNER');
    expect(ROLES.ADMIN).toBe('ADMIN');
    expect(ROLES.STRATEGIST).toBe('STRATEGIST');
    expect(ROLES.EDITOR).toBe('EDITOR');
    expect(ROLES.APPROVER).toBe('APPROVER');
    expect(ROLES.CLIENT).toBe('CLIENT');
  });

  it('CAN_CREATE_BRANDS excludes CLIENT and APPROVER', () => {
    expect(CAN_CREATE_BRANDS).toContain(ROLES.OWNER);
    expect(CAN_CREATE_BRANDS).toContain(ROLES.ADMIN);
    expect(CAN_CREATE_BRANDS).toContain(ROLES.STRATEGIST);
    expect(CAN_CREATE_BRANDS).toContain(ROLES.EDITOR);
    expect(CAN_CREATE_BRANDS).not.toContain(ROLES.APPROVER);
    expect(CAN_CREATE_BRANDS).not.toContain(ROLES.CLIENT);
  });

  it('CAN_RUN_RESEARCH matches CAN_CREATE_BRANDS for now', () => {
    expect(CAN_RUN_RESEARCH).toEqual(CAN_CREATE_BRANDS);
  });
});