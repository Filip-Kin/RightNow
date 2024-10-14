export { };

declare global {
    namespace NodeJS {
        interface ProcessEnv {
            DB_USER: string;
            DB_PASS: string;
            DB_HOST: string;
            DB_PORT: number;
            DB_NAME: string;
            PORT: number;
        }
    }
}