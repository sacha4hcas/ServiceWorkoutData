import '@servicenow/sdk/global'

declare global {
    namespace Now {
        namespace Internal {
            interface Keys extends KeysRegistry {
                explicit: {
                    bom_json: {
                        table: 'sys_module'
                        id: 'e64259f0694647cf93fdbde664723245'
                    }
                    package_json: {
                        table: 'sys_module'
                        id: '52dc322210444c6a91ce036b67f8c3ce'
                    }
                }
            }
        }
    }
}
