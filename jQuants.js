import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import * as readline from "readline";
import('dotenv/config');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const getAuthTokenId = async () => {
    try {
        const response = await fetch('https://api.jquants.com/v1/token/auth_user', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({"mailaddress": process.env.mailaddress, "password": process.env.password})
        });
        const data = await response.json();
        return data.refreshToken;
    } catch (error) {
        console.error('Error:', error);
    }
}

const getToken = async (refToken) => {
    try {
        const params = new URLSearchParams({refreshtoken: refToken});
        const url = 'https://api.jquants.com/v1/token/auth_refresh?' + params.toString();

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        return await response.json();
    } catch (error) {
        console.error('Error:', error);
    }
}


export const getFinancialData = async (code, data) => {
    let formatFinancialData;
    const refreashToken = await getAuthTokenId();
    const tokenId = await getToken(refreashToken)

    //銘柄名取得
    const stockName = await getStockName(code, tokenId.idToken)

    const requestParams = {
        code: code ? code : 7203,
        data: data ? data : "",
        pagination_key: ""
    }
    const params = new URLSearchParams(requestParams);

    const url = "https://api.jquants.com/v1/fins/statements?" + params.toString();
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': tokenId.idToken
            }
        });
        const jsonData = await response.json();

        const searchWord = "FYFinancialStatements_Consolidated"
        jsonData.statements?.find(item => {
            if (item.TypeOfDocument.includes(searchWord)) {
                formatFinancialData = {
                    LocalCode: item.LocalCode, //銘柄コード
                    CompanyName: stockName.CompanyName,
                    Sector17CodeName: stockName.Sector17CodeName,
                    MarketCode: stockName.MarketCode,
                    MarketCodeName: stockName.MarketCodeName,
                    OperatingProfit: item.OperatingProfit, //営業利益
                    OperatingProfitMargin: parseFloat((item.OperatingProfit / item.NetSales)).toFixed(3) * 100 + "%", //営業利益率
                    TotalAssets: item.TotalAssets, //総資産
                    Equity: item.Equity, // 純資産（株主資本)
                    EquityRatio: parseFloat((item.Equity / item.TotalAssets)).toFixed(3) * 100 + "%", //自己資本比率
                    EnterpriseValue: (item.TotalAssets - item.CashAndEquivalents), // 企業価値 = 総資産 - 現金及び現金同等
                    DisclosedDate: item.DisclosedDate
                }
            }
            console.log("financial data -> ", formatFinancialData)
        })
        const items = [formatFinancialData];
        const csv = convertToCSV(items);
        const filePath = path.join(__dirname, 'financial_data.csv');

        fs.writeFile(filePath, csv, function (err) {
            if (err) {
                return console.error(err);
            }
            console.log('financial_data.csv was saved in the current directory!');
        });
        return formatFinancialData
    } catch (error) {
        console.error('Error:', error);
    }
}

function convertToCSV(objArray) {
    const headers = [
        '銘柄コード',
        '企業名',
        '業種',
        '市場コード',
        '市場名',
        '営業利益',
        '営業利益率',
        '総資産',
        '純資産',
        '自己資本比率',
        '企業価値',
        '決算日'
    ];

    const headerKeyMap = {
        '銘柄コード': 'LocalCode',
        '企業名': 'CompanyName',
        '業種': 'Sector17CodeName',
        '市場コード': 'MarketCode',
        '市場名': 'MarketCodeName',
        '営業利益': 'OperatingProfit',
        '営業利益率': 'OperatingProfitMargin',
        '総資産': 'TotalAssets',
        '純資産': 'Equity',
        '自己資本比率': 'EquityRatio',
        '企業価値': 'EnterpriseValue',
        '決算日': 'DisclosedDate'
    };
    const headerLine = headers.join(',');

    const dataLines = objArray.map(obj => {
        return headers.map(header => obj[headerKeyMap[header]]).join(',');
    });
    return [headerLine].concat(dataLines).join('\n');
}

const getStockName = async (code, authToken) => {
    const requestParams = {
        code: code,
        data: ""
    }
    const params = new URLSearchParams(requestParams);

    const url = "https://api.jquants.com/v1/listed/info?" + params.toString();
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authToken
            }
        });
        const jsonData = await response.json();
        return jsonData.info[0]
    } catch (error) {
        console.error('Error:', error);
    }
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
rl.question('銘柄コードを入力してください ', (code) => {
    getFinancialData(code)
    rl.close();
});
