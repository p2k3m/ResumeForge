import * as core from 'puppeteer-core';

const puppeteer = core.default ?? core;

export const launch = (...args) => puppeteer.launch(...args);
export const connect = (...args) => puppeteer.connect?.(...args);
export const executablePath = (...args) => puppeteer.executablePath?.(...args);
export * from 'puppeteer-core';

export default puppeteer;
