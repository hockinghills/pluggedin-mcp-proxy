import crypto from 'crypto';
import {
  getSessionKey,
  sanitizeName,
  getPluggedinMCPApiKey,
  getPluggedinMCPApiBaseUrl,
  isDebugEnabled,
  getDefaultEnvironment,
} from './utils.js';
import { ServerParameters } from './types.js';

describe('Utility Functions', () => {

  describe('getSessionKey', () => {
    it('should generate a consistent session key for the same parameters', () => {
      const uuid = 'test-uuid';
      const params: ServerParameters = {
        uuid: uuid,
        name: 'Test Server',
        type: 'STDIO',
        command: 'echo',
        args: ['hello'],
        env: { VAR: 'value' },
      };
      const key1 = getSessionKey(uuid, params);
      const key2 = getSessionKey(uuid, params);
      expect(key1).toBe(key2);
      expect(key1).toContain(uuid);
    });

    it('should generate different keys for different parameters', () => {
      const uuid = 'test-uuid';
      const params1: ServerParameters = { uuid: uuid, name: 'Test Server', type: 'STDIO', command: 'cmd1' };
      const params2: ServerParameters = { uuid: uuid, name: 'Test Server', type: 'STDIO', command: 'cmd2' }; // Different command
      const key1 = getSessionKey(uuid, params1);
      const key2 = getSessionKey(uuid, params2);
      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different UUIDs', () => {
      const params: ServerParameters = { uuid: 'uuid1', name: 'Test Server', type: 'STDIO', command: 'cmd' };
      const key1 = getSessionKey('uuid1', params);
      const key2 = getSessionKey('uuid2', { ...params, uuid: 'uuid2' }); // Ensure params object reflects uuid change if needed by hashing logic
      expect(key1).not.toBe(key2);
    });
  });

  describe('sanitizeName', () => {
    it('should convert to lowercase', () => {
      expect(sanitizeName('ServerName')).toBe('servername');
    });

    it('should replace spaces and special characters with underscores', () => {
      expect(sanitizeName('Server Name 1!')).toBe('server_name_1_');
      expect(sanitizeName('github.com/test')).toBe('github_com_test');
    });

    it('should handle existing underscores correctly', () => {
      expect(sanitizeName('server_one')).toBe('server_one');
    });

    it('should handle empty strings', () => {
      expect(sanitizeName('')).toBe('');
    });
  });

  describe('API Key and Base URL Helpers', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
      jest.resetModules(); // Clear cache
      process.env = { ...OLD_ENV }; // Make a copy
    });

    afterAll(() => {
      process.env = OLD_ENV; // Restore old environment
    });

    it('getPluggedinMCPApiKey should return env variable', () => {
      process.env.PLUGGEDIN_API_KEY = 'env-key-123';
      expect(getPluggedinMCPApiKey()).toBe('env-key-123');
    });

    it('getPluggedinMCPApiKey should return undefined if not set', () => {
      delete process.env.PLUGGEDIN_API_KEY;
      expect(getPluggedinMCPApiKey()).toBeUndefined();
    });

    it('getPluggedinMCPApiBaseUrl should return env variable', () => {
      process.env.PLUGGEDIN_API_BASE_URL = 'http://env.url';
      expect(getPluggedinMCPApiBaseUrl()).toBe('http://env.url');
    });

    it('getPluggedinMCPApiBaseUrl should return undefined if not set', () => {
      delete process.env.PLUGGEDIN_API_BASE_URL;
      expect(getPluggedinMCPApiBaseUrl()).toBeUndefined();
    });
  });

  describe('isDebugEnabled', () => {
     const OLD_ENV = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...OLD_ENV };
    });

    afterAll(() => {
      process.env = OLD_ENV;
    });

    it('should return true if DEBUG env var is "true"', () => {
      process.env.DEBUG = 'true';
      expect(isDebugEnabled()).toBe(true);
    });

    it('should return false if DEBUG env var is not "true"', () => {
      process.env.DEBUG = 'false';
      expect(isDebugEnabled()).toBe(false);
      process.env.DEBUG = '1';
      expect(isDebugEnabled()).toBe(false);
    });

    it('should return false if DEBUG env var is not set', () => {
      delete process.env.DEBUG;
      expect(isDebugEnabled()).toBe(false);
    });
  });

  describe('getDefaultEnvironment', () => {
     const OLD_ENV = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...OLD_ENV };
    });

    afterAll(() => {
      process.env = OLD_ENV;
    });

    it('should include PATH if set in process.env', () => {
      process.env.PATH = '/usr/bin:/bin';
      const defaultEnv = getDefaultEnvironment();
      expect(defaultEnv.PATH).toBe('/usr/bin:/bin');
    });

     it('should not include PATH if not set in process.env', () => {
      delete process.env.PATH;
      const defaultEnv = getDefaultEnvironment();
      expect(defaultEnv.PATH).toBeUndefined();
    });

    it('should include other common env vars if set', () => {
       process.env.HOME = '/home/user';
       process.env.USER = 'testuser';
       process.env.LANG = 'en_US.UTF-8';
       process.env.LC_ALL = 'C';
       const defaultEnv = getDefaultEnvironment();
       expect(defaultEnv.HOME).toBe('/home/user');
       expect(defaultEnv.USER).toBe('testuser');
       expect(defaultEnv.LANG).toBe('en_US.UTF-8');
       expect(defaultEnv.LC_ALL).toBe('C');
    });

     it('should not include other common env vars if not set', () => {
       delete process.env.HOME;
       delete process.env.USER;
       delete process.env.LANG;
       delete process.env.LC_ALL;
       const defaultEnv = getDefaultEnvironment();
       expect(defaultEnv.HOME).toBeUndefined();
       expect(defaultEnv.USER).toBeUndefined();
       expect(defaultEnv.LANG).toBeUndefined();
       expect(defaultEnv.LC_ALL).toBeUndefined();
    });
  });

});
