import { describe, expect, it } from 'vitest';
import { parseMove } from '~~/utils/household-move';

const REQ = '5f0c1f7e-8d43-4c55-9d8f-0d1b8a6c2e11';
const H = '0a0a0a0a-0000-4000-8000-000000000001';

describe('parseMove', () => {
  it('needs a uuid request id, so retries can replay the first result', () => {
    expect(parseMove('leave', {})).toEqual({ error: 'request_id must be a uuid' });
    expect(parseMove('leave', { request_id: 'abc' })).toEqual({ error: 'request_id must be a uuid' });
    expect(parseMove('leave', { request_id: REQ })).toEqual({ request_id: REQ, move: { action: 'leave', args: {} } });
  });

  it('brings items along on join unless told not to', () => {
    expect(parseMove('join', { request_id: REQ, token: 't' })).toEqual({
      request_id: REQ,
      move: { action: 'join', args: { token: 't', bring: true } }
    });
    expect(parseMove('join', { request_id: REQ, token: 't', bring: false })).toMatchObject({
      move: { args: { bring: false } }
    });
    expect(parseMove('join', { request_id: REQ, token: 't', bring: 'yes' })).toEqual({ error: 'bring must be a boolean' });
    expect(parseMove('join', { request_id: REQ })).toEqual({ error: 'token must be a string' });
  });

  it('accepts a pick with uuid households only', () => {
    expect(parseMove('pick', { request_id: REQ, household: H, import: [H] })).toMatchObject({
      move: { action: 'pick', args: { household: H, import: [H] } }
    });
    expect(parseMove('pick', { request_id: REQ, household: H, import: ['x'] })).toEqual({
      error: 'import must be a list of uuids'
    });
    expect(parseMove('pick', { request_id: REQ, household: 'x' })).toEqual({ error: 'household must be a uuid' });
  });

  it('passes a create name through for the server to judge', () => {
    expect(parseMove('create', { request_id: REQ, name: '  ' })).toMatchObject({ move: { args: { name: '  ' } } });
    expect(parseMove('create', { request_id: REQ })).toEqual({ error: 'name must be a string' });
  });
});
