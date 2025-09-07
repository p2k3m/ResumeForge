import dns from 'dns';

jest.spyOn(dns.promises, 'lookup').mockImplementation(async () => ({
  address: '93.184.216.34', // example.com public IP
  family: 4
}));
