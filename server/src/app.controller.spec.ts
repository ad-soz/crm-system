import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';

describe('AppController', () => {
  let app: TestingModule;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('healthCheck', () => {
    it('should return { status: "ok" }', () => {
      const appController = app.get(AppController);
      expect(appController.healthCheck()).toEqual({ status: 'ok' });
    });
  });
});
