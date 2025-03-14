import {ZakatUIController} from "./zakatUIController.js";
import {initVersionInfo} from "./version.js";

document.addEventListener('DOMContentLoaded', () => {
    new ZakatUIController();
    initVersionInfo();

});