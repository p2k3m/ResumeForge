import dns from 'dns';
import { jest } from '@jest/globals';

jest.spyOn(dns.promises, 'lookup').mockImplementation(async () => ({
  address: '93.184.216.34', // example.com public IP
  family: 4
}));
