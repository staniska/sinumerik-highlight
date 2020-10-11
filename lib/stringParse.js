'use babel';

import View from './sinumerik'
import {mathParse} from "./interpretator";

export default function (str, programName, programRow) {
    // console.log(str);
    var new_str = "";
    if (str.length == 0) {
        return new_str;
    }


    str.split('<<').forEach((str_part) => {
        // console.log(str_part[0], str_part[str_part.length - 1]);
            if (str_part[0].search(/[\'\"]/) < 0) {
                try {
                    str_part = mathParse(str_part, programName);
                }
                catch (e) {
                    console.error(e);
                    View.sinumerikView.parseData.errors.push({text: `Parse error for MSG "${str}" row ${programRow + 1}`, row: programRow});
                }
            } else if (str_part[0].search(/[\'\"]/) >=0 && str_part[0] == str_part[str_part.length - 1]) {
                str_part = str_part.slice(1,-1);
                // console.log(str_part);
            } else {
                str_part = "";
                View.sinumerikView.parseData.errors.push({text: `Parse error for MSG "${str}" row ${programRow + 1}`, row: programRow});
            }

            new_str += str_part;
        }
    )
    return (new_str);
}