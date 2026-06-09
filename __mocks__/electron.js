module.exports = {
    remote: {
        dialog: {
            showOpenDialog: jest.fn(),
            showSaveDialog: jest.fn(),
            showMessageBox: jest.fn(() => ({response: 0})),
        }
    }
};
