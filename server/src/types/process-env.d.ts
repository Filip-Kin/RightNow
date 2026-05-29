export { };

declare global {
    namespace NodeJS {
        interface ProcessEnv {
            DB_USER: string;
            DB_PASSWORD: string;
            DB_HOST: string;
            DB_PORT: string;
            DB_NAME: string;
            DB_SSL?: string;
            PORT?: string;
        }
    }
}
