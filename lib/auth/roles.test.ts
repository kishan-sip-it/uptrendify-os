import { describe, it, expect } from 'vitest';
import {
  ASSIGNABLE_ROLES_BY_ROLE, CAN_CREATE_BRANDS, CAN_INVITE_MEMBERS, CAN_MANAGE_MEMBERS,
  CAN_REMOVE_MEMBER, CAN_RUN_RESEARCH, CAN_REVIEW_CONTENT, CAN_UPDATE_MEMBER_ROLE, CAN_VIEW_DASHBOARD,
  CAN_VIEW_TEAM, INVITABLE_ROLES, ROLES,
} from './roles';

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

  it('CAN_VIEW_DASHBOARD includes every organization role', () => {
    for (const role of Object.values(ROLES)) {
      expect(CAN_VIEW_DASHBOARD).toContain(role);
    }
  });

  it('CAN_REVIEW_CONTENT reserves approval to owner/admin/strategist/approver', () => {
    expect(CAN_REVIEW_CONTENT).toContain(ROLES.OWNER);
    expect(CAN_REVIEW_CONTENT).toContain(ROLES.ADMIN);
    expect(CAN_REVIEW_CONTENT).toContain(ROLES.STRATEGIST);
    expect(CAN_REVIEW_CONTENT).toContain(ROLES.APPROVER);
    expect(CAN_REVIEW_CONTENT).not.toContain(ROLES.EDITOR);
    expect(CAN_REVIEW_CONTENT).not.toContain(ROLES.CLIENT);
  });

  it('CAN_VIEW_TEAM includes every organization role', () => {
    for (const role of Object.values(ROLES)) {
      expect(CAN_VIEW_TEAM).toContain(role);
    }
  });

  it('member-management is reserved to OWNER and ADMIN only', () => {
    const expected = [ROLES.OWNER, ROLES.ADMIN];
    expect(CAN_MANAGE_MEMBERS).toEqual(expected);
    expect(CAN_INVITE_MEMBERS).toEqual(expected);
    expect(CAN_UPDATE_MEMBER_ROLE).toEqual(expected);
    expect(CAN_REMOVE_MEMBER).toEqual(expected);
  });

  it('OWNER is never an invitable role', () => {
    expect(INVITABLE_ROLES).not.toContain(ROLES.OWNER);
    for (const role of INVITABLE_ROLES) {
      expect(Object.values(ROLES)).toContain(role);
    }
  });

  it('ADMIN can assign every non-OWNER role but never OWNER', () => {
    const adminAssignable = ASSIGNABLE_ROLES_BY_ROLE[ROLES.ADMIN];
    expect(adminAssignable).not.toContain(ROLES.OWNER);
    for (const role of INVITABLE_ROLES) {
      expect(adminAssignable).toContain(role);
    }
  });

  it('only the OWNER may assign the OWNER role', () => {
    expect(ASSIGNABLE_ROLES_BY_ROLE[ROLES.OWNER]).toContain(ROLES.OWNER);
    for (const role of [ROLES.ADMIN, ROLES.STRATEGIST, ROLES.EDITOR, ROLES.APPROVER, ROLES.CLIENT]) {
      expect(ASSIGNABLE_ROLES_BY_ROLE[role]).not.toContain(ROLES.OWNER);
    }
  });

  it('non-manager roles cannot change or remove members', () => {
    for (const role of [ROLES.STRATEGIST, ROLES.EDITOR, ROLES.APPROVER, ROLES.CLIENT]) {
      expect(ASSIGNABLE_ROLES_BY_ROLE[role]).toEqual([]);
      expect(CAN_UPDATE_MEMBER_ROLE).not.toContain(role);
      expect(CAN_REMOVE_MEMBER).not.toContain(role);
    }
  });
});